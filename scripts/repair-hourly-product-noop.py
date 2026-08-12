"""Apply the bounded hourly product-development no-op fallback repair.

This one-shot script is executed only on the dedicated repair branch. It patches
reviewed repository contracts, then removes itself and its temporary workflow so
neither helper can reach protected ``main``.
"""

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment or fail closed.

    Args:
        text: Complete UTF-8 file content.
        old: Reviewed fragment that must occur exactly once.
        new: Replacement fragment.
        label: Human-readable contract name for failures.

    Returns:
        The content with the single replacement applied.

    Raises:
        SystemExit: If the reviewed fragment is missing or duplicated.
    """

    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


workflow_path = Path(".github/workflows/hourly-product-development.yml")
workflow = workflow_path.read_text(encoding="utf-8")
model_start_marker = "      - name: Run the NVIDIA NIM development agent\n"
model_end_marker = "      - name: Set up Node.js for exact repository verification\n"
model_start = workflow.index(model_start_marker)
model_end = workflow.index(model_end_marker, model_start)
current_model_step = workflow[model_start:model_end]
if "completed_without_mutation" in current_model_step:
    raise SystemExit("model fallback contract is already present")
if "break" not in current_model_step or "status=1" not in current_model_step:
    raise SystemExit("unexpected current model-loop shape")

expression_open = "${" + "{"
nvidia_secret = expression_open + " secrets.NVIDIA_NIM_API_KEY }}"
execution_mode = expression_open + " steps.gate.outputs.mode }}"
repaired_model_step = """      - name: Run the NVIDIA NIM development agent
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        env:
          NVIDIA_API_KEY: @@NVIDIA_SECRET@@
          EXECUTION_MODE: @@EXECUTION_MODE@@
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"

          prompt="$(cat "$RUNNER_TEMP/diagramweave-agent-prompt.md")"
          status=1
          completed_without_mutation=0
          for model in $OPENCODE_MODEL_CANDIDATES; do
            echo "::group::opencode $model"
            if timeout --kill-after=30s "${OPENCODE_RUN_TIMEOUT_SECONDS}s" \\
              env -u GH_TOKEN -u GITHUB_TOKEN -u REPOSITORY_TOKEN \\
              -u ACTIONS_ID_TOKEN_REQUEST_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_URL \\
              opencode run "$prompt" --model "$model"; then
              meaningful_status="$(
                git status --porcelain --untracked-files=all \\
                  | grep -vE '^\\?\\? PR_MESSAGE\\.md$' || true
              )"
              if [ -n "$meaningful_status" ]; then
                status=0
                echo "::endgroup::"
                echo "Agent session produced a repository mutation with \`$model\`." \\
                  >>"$GITHUB_STEP_SUMMARY"
                break
              fi
              completed_without_mutation=$((completed_without_mutation + 1))
              echo "::endgroup::"
              echo "::warning::Model $model completed without a repository mutation; trying the next candidate."
            else
              echo "::endgroup::"
              echo "::warning::Model $model failed; discarding partial work and trying the next candidate."
            fi
            git reset --hard HEAD
            git clean -fd
          done
          if [ "$status" -ne 0 ]; then
            if [ "$EXECUTION_MODE" = "remediation" ] && \\
               [ "$completed_without_mutation" -gt 0 ]; then
              echo "Every candidate failed or completed without a safe remediation mutation; leaving the exact head unchanged after candidate exhaustion." \\
                >>"$GITHUB_STEP_SUMMARY"
              exit 0
            fi
            echo "::error::Every NVIDIA NIM model candidate failed or completed without a product mutation; no product increment was proposed."
            exit 1
          fi

"""
repaired_model_step = repaired_model_step.replace(
    "@@NVIDIA_SECRET@@", nvidia_secret
).replace("@@EXECUTION_MODE@@", execution_mode)
workflow = workflow[:model_start] + repaired_model_step + workflow[model_end:]

prompt_tail = """          Write PR_MESSAGE.md at the repository root with the title on the first line and a
          body containing reproducible verification evidence, citations where relevant, and
          explicit residual risks.
"""
prompt_replacement = prompt_tail + """          A successful model process exit without a meaningful working-tree mutation is not
          completion. Implement the bounded increment; an unchanged tree causes the trusted
          shell to discard that candidate and try the next configured model.
"""
workflow = replace_once(
    workflow,
    prompt_tail,
    prompt_replacement,
    "product prompt completion contract",
)

old_noop_guard = """          if [ -z "$meaningful_status" ]; then
            rm -f PR_MESSAGE.md
            echo "mutation=false" >>"$GITHUB_OUTPUT"
            echo "No safe repository mutation was produced." >>"$GITHUB_STEP_SUMMARY"
            exit 0
          fi
"""
new_noop_guard = """          if [ -z "$meaningful_status" ]; then
            rm -f PR_MESSAGE.md
            echo "mutation=false" >>"$GITHUB_OUTPUT"
            if [ "$EXECUTION_MODE" = "product" ]; then
              echo "::error::Product-development mode completed without a repository mutation."
              echo "A clean model exit is not a completed product increment." \\
                >>"$GITHUB_STEP_SUMMARY"
              exit 1
            fi
            echo "No safe remediation mutation was produced after candidate exhaustion." \\
              >>"$GITHUB_STEP_SUMMARY"
            exit 0
          fi
"""
workflow = replace_once(
    workflow,
    old_noop_guard,
    new_noop_guard,
    "verification no-op guard",
)
workflow_path.write_text(workflow, encoding="utf-8")

guide_path = Path("docs/operations/hourly-development.md")
guide = guide_path.read_text(encoding="utf-8")
old_product_mode = """When the verified inventory contains no open pull request, the workflow may run exactly one bounded OpenCode session against NVIDIA NIM and package one buyer-visible increment as one new pull request. Immediately before creating that PR it re-fetches the queue; if another PR appeared after the initial gate, it fails closed rather than creating duplicate work.

The delegated session preserves DiagramWeave's source-first manual editing mode, uses or improves Contextual Orchestrator for product LLM work, retains modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfies the repository's test, coverage, docstring, security, documentation, and design contracts.
"""
new_product_mode = """When the verified inventory contains no open pull request, the workflow runs an ordered, bounded sequence of configured NVIDIA NIM candidates and may package one buyer-visible increment as one new pull request. Immediately before creating that PR it re-fetches the queue; if another PR appeared after the initial gate, it fails closed rather than creating duplicate work.

A model process exit code of zero proves only that the process terminated normally. It is not evidence that product work was completed. After each candidate returns, the trusted shell checks the working tree while excluding metadata-only `PR_MESSAGE.md`. A clean working tree causes that candidate to be discarded and the next configured model to run. Partial output from a failed or clean no-op candidate is reset before the next attempt. If every product candidate fails or completes without a meaningful mutation, the workflow fails visibly and creates no branch or pull request.

The delegated sessions preserve DiagramWeave's source-first manual editing mode, use or improve Contextual Orchestrator for product LLM work, retain modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfy the repository's test, coverage, docstring, security, documentation, and design contracts.
"""
guide = replace_once(
    guide,
    old_product_mode,
    new_product_mode,
    "operations product mode",
)
old_failure = """- Every NVIDIA NIM model candidate fails: reset partial work, fail visibly, and publish nothing.
- Repository verification fails: publish nothing.
"""
new_failure = """- A model candidate exits successfully but leaves no meaningful repository mutation: treat it as incomplete, reset the candidate, and try the next configured model. Exit code zero alone is not completion evidence.
- Every product-mode candidate fails or completes without a meaningful mutation: fail visibly and publish nothing.
- Remediation candidates are exhausted without a safe mutation: only then leave the exact PR head unchanged; do not claim that the blocker was repaired.
- Repository verification fails: publish nothing.
"""
guide = replace_once(
    guide,
    old_failure,
    new_failure,
    "operations failure handling",
)
guide_path.write_text(guide, encoding="utf-8")

adr_path = Path("docs/adr/0007-automation-authority.md")
adr = adr_path.read_text(encoding="utf-8")
decision_anchor = """The model-assisted development process may inspect the checked-out revision, produce a revision-bound working-tree proposal, and emit review evidence such as `PR_MESSAGE.md`; it has no repository publication, approval, merge, tag, package-publish, or release credential.

"""
decision_addition = decision_anchor + """A successful model-process exit is runtime evidence only, not proof of a completed repository proposal. In product-development mode, the trusted boundary requires a meaningful non-metadata working-tree mutation before deterministic verification or publication can proceed. A clean no-op candidate is reset and the next configured model is attempted; exhaustion without a product mutation is a visible workflow failure. Remediation may leave an exact PR head unchanged only after the bounded candidate set is exhausted without a safe mutation.

"""
adr = replace_once(
    adr,
    decision_anchor,
    decision_addition,
    "ADR process-completion boundary",
)
consequence_anchor = (
    "- A successfully opened PR is only a review candidate, never merge or release evidence.\n"
)
consequence_replacement = consequence_anchor + (
    "- A successfully exited model process with an unchanged working tree is not a "
    "completed product-development run and cannot be represented as one.\n"
)
adr = replace_once(
    adr,
    consequence_anchor,
    consequence_replacement,
    "ADR consequence",
)
adr_path.write_text(adr, encoding="utf-8")

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
changed_heading = "### Changed\n\n"
changelog_entry = """### Changed

- Hourly product development now treats a successful OpenCode process with an
  unchanged working tree as an incomplete candidate, resets candidate output,
  tries the next configured NVIDIA NIM model, fails visibly when every product
  candidate is a failure or no-op, and permits an unchanged remediation head
  only after bounded candidate exhaustion.
"""
changelog = replace_once(
    changelog,
    changed_heading,
    changelog_entry,
    "changelog changed section",
)
changelog_path.write_text(changelog, encoding="utf-8")

Path(".github/workflows/repair-hourly-product-noop.yml").unlink()
Path("scripts/repair-hourly-product-noop.py").unlink()
