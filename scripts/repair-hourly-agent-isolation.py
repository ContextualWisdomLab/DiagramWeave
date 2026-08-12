"""Apply the test-backed hourly autonomous-agent isolation repair.

The script is a one-shot branch helper. It patches the reviewed workflow and
canonical governance records, updates superseded contract assertions, and then
removes itself together with the temporary repair workflow before the verified
commit is created.
"""

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment or fail closed."""

    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_tail(text: str, marker: str, replacement: str, label: str) -> str:
    """Replace the unique tail beginning at ``marker`` or fail closed."""

    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return text[: text.index(marker)] + replacement


workflow_path = Path(".github/workflows/hourly-product-development.yml")
workflow = workflow_path.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    "      REPOSITORY_TOKEN: ${{ github.token }}\n",
    "",
    "job-scoped repository token",
)
workflow = replace_once(
    workflow,
    """      - name: Select remediation or product-development mode
        id: gate
        shell: bash
        run: |
""",
    """      - name: Select remediation or product-development mode
        id: gate
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
""",
    "gate token scope",
)
workflow = replace_once(
    workflow,
    'GH_TOKEN="$REPOSITORY_TOKEN" gh pr list',
    "gh pr list",
    "gate inventory token use",
)

new_tail = r'''      - name: Install the pinned OpenCode CLI
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        run: |
          set -euo pipefail
          archive="${RUNNER_TEMP}/opencode-linux-x64.tar.gz"
          curl -fsSL \
            -o "$archive" \
            "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz"
          printf '%s  %s\n' "$OPENCODE_SHA256" "$archive" | sha256sum -c -
          tar -xzf "$archive" -C "$RUNNER_TEMP"
          sudo install -m 0755 "${RUNNER_TEMP}/opencode" /usr/local/bin/opencode
          /usr/local/bin/opencode --version

      - name: Configure OpenCode for NVIDIA NIM
        id: opencode_config
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        run: |
          set -euo pipefail
          config_file="$RUNNER_TEMP/diagramweave-opencode.json"
          cat >"$config_file" <<'CONFIG'
          {
            "$schema": "https://opencode.ai/config.json",
            "enabled_providers": ["nvidia-nim"],
            "model": "nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5",
            "small_model": "nvidia-nim/meta/llama-3.3-70b-instruct",
            "provider": {
              "nvidia-nim": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "NVIDIA NIM",
                "options": {
                  "baseURL": "https://integrate.api.nvidia.com/v1",
                  "apiKey": "{env:NVIDIA_API_KEY}"
                },
                "models": {
                  "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
                    "name": "NVIDIA Llama 3.3 Nemotron Super 49B v1.5",
                    "tool_call": true,
                    "limit": {"context": 131072, "output": 8192}
                  },
                  "nvidia/nemotron-3-super-120b-a12b": {
                    "name": "NVIDIA Nemotron 3 Super 120B",
                    "tool_call": true,
                    "limit": {"context": 131072, "output": 8192}
                  },
                  "deepseek-ai/deepseek-v4-pro": {
                    "name": "DeepSeek V4 Pro (NIM)",
                    "tool_call": true,
                    "limit": {"context": 131072, "output": 8192}
                  },
                  "meta/llama-3.3-70b-instruct": {
                    "name": "Meta Llama 3.3 70B Instruct (NIM)",
                    "tool_call": true,
                    "limit": {"context": 131072, "output": 8192}
                  }
                }
              }
            }
          }
          CONFIG
          chmod 0600 "$config_file"
          echo "config_path=$config_file" >>"$GITHUB_OUTPUT"

      - name: Capture trusted Git control plane
        id: trusted_git
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"
          trusted_git_dir="$RUNNER_TEMP/diagramweave-trusted-git"
          trusted_git_home="$RUNNER_TEMP/diagramweave-trusted-git-home"
          rm -rf "$trusted_git_dir" "$trusted_git_home"
          mkdir -p "$trusted_git_dir" "$trusted_git_home"
          cp -- .git/config "$trusted_git_dir/config"
          cp -- .git/HEAD "$trusted_git_dir/HEAD"
          cp -a -- .git/refs "$trusted_git_dir/refs"
          cp -a -- .git/info "$trusted_git_dir/info"
          cp -a -- .git/hooks "$trusted_git_dir/hooks"
          if [ -f .git/packed-refs ]; then
            cp -- .git/packed-refs "$trusted_git_dir/packed-refs"
          fi
          trusted_head_sha="$(
            env -i \
              HOME="$trusted_git_home" \
              PATH=/usr/bin:/bin \
              LANG=C.UTF-8 \
              LC_ALL=C.UTF-8 \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              /usr/bin/git -c core.hooksPath=/dev/null rev-parse HEAD
          )"
          if ! [[ "$trusted_head_sha" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::The checked-out trusted head is malformed."
            exit 1
          fi
          echo "head_sha=$trusted_head_sha" >>"$GITHUB_OUTPUT"

      - name: Run the NVIDIA NIM development agent
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        env:
          NVIDIA_API_KEY: ${{ secrets.NVIDIA_NIM_API_KEY }}
          EXECUTION_MODE: ${{ steps.gate.outputs.mode }}
          TRUSTED_HEAD_SHA: ${{ steps.trusted_git.outputs.head_sha }}
          OPENCODE_CONFIG_PATH: ${{ steps.opencode_config.outputs.config_path }}
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"

          agent_user="diagramweave-agent"
          trusted_path="/usr/local/bin:/usr/bin:/bin"
          trusted_git_home="$RUNNER_TEMP/diagramweave-trusted-git-home"
          prompt="$(cat "$RUNNER_TEMP/diagramweave-agent-prompt.md")"
          status=1
          completed_without_mutation=0
          candidate_index=0

          trusted_git() {
            env -i \
              HOME="$trusted_git_home" \
              PATH="$trusted_path" \
              LANG=C.UTF-8 \
              LC_ALL=C.UTF-8 \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              /usr/bin/git \
                -c core.hooksPath=/dev/null \
                -c core.fsmonitor=false \
                -c diff.external= \
                "$@"
          }

          cleanup_agent_processes() {
            sudo pkill -KILL -u "$agent_user" 2>/dev/null || true
            sleep 1
            if sudo pgrep -u "$agent_user" >/dev/null 2>&1; then
              echo "::error::A detached background process survived the model boundary."
              return 1
            fi
          }

          restore_git_control_plane() {
            proposal_root="$1"
            snapshot_root="$2"
            rm -rf "$proposal_root/.git"
            cp -a -- "$snapshot_root" "$proposal_root/.git"
            test -f "$proposal_root/.git/config"
            test -f "$proposal_root/.git/HEAD"
            test -d "$proposal_root/.git/refs"
            test -d "$proposal_root/.git/info"
            test -d "$proposal_root/.git/hooks"
            rm -f \
              "$proposal_root/.git/info/grafts" \
              "$proposal_root/.git/objects/info/alternates"
            rm -rf "$proposal_root/.git/refs/replace"
            trusted_git -C "$proposal_root" reset --mixed "$TRUSTED_HEAD_SHA"
            observed_head_sha="$(trusted_git -C "$proposal_root" rev-parse HEAD)"
            if [ "$observed_head_sha" != "$TRUSTED_HEAD_SHA" ]; then
              echo "::error::Disposable clone Git control plane did not restore exactly."
              return 1
            fi
          }

          import_proposal() {
            proposal_root="$1"
            candidate_number="$2"
            patch_file="$RUNNER_TEMP/diagramweave-agent-${candidate_number}.patch"
            untracked_file="$RUNNER_TEMP/diagramweave-agent-${candidate_number}.untracked"

            if trusted_git -C "$proposal_root" diff --summary "$TRUSTED_HEAD_SHA" -- \
              | grep -E '(create mode|mode change).*120000' >/dev/null; then
              echo "::error::Agent proposals cannot create symbolic links."
              return 1
            fi

            # Trusted equivalent of: git diff --binary --full-index
            trusted_git -C "$proposal_root" \
              diff --binary --full-index --no-ext-diff "$TRUSTED_HEAD_SHA" -- \
              >"$patch_file"
            if [ -s "$patch_file" ]; then
              # Trusted equivalent of: git apply --binary
              trusted_git -C "$GITHUB_WORKSPACE" \
                apply --binary --whitespace=nowarn "$patch_file"
            fi

            # Trusted equivalent of: git ls-files --others --exclude-standard -z
            trusted_git -C "$proposal_root" \
              ls-files --others --exclude-standard -z \
              >"$untracked_file"
            PROPOSAL_ROOT="$proposal_root" \
            TARGET_ROOT="$GITHUB_WORKSPACE" \
            UNTRACKED_FILE="$untracked_file" \
              python3 - <<'PY'
          import os
          import shutil
          import stat
          from pathlib import Path

          proposal_root = Path(os.environ["PROPOSAL_ROOT"])
          target_root = Path(os.environ["TARGET_ROOT"])
          untracked_file = Path(os.environ["UNTRACKED_FILE"])
          maximum_file_count = 2048
          maximum_total_bytes = 64 * 1024 * 1024

          encoded_paths = [
              value
              for value in untracked_file.read_bytes().split(b"\0")
              if value
          ]
          if len(encoded_paths) > maximum_file_count:
              raise SystemExit("agent proposal contains too many untracked files")

          validated = []
          total_bytes = 0
          for encoded_path in encoded_paths:
              relative_text = os.fsdecode(encoded_path)
              relative_path = Path(relative_text)
              if (
                  relative_path.is_absolute()
                  or not relative_path.parts
                  or any(
                      part in {"", ".", "..", ".git"}
                      for part in relative_path.parts
                  )
              ):
                  raise SystemExit("agent proposal contains an unsafe path")

              source_path = proposal_root.joinpath(relative_path)
              cursor = proposal_root
              for part in relative_path.parts:
                  cursor = cursor.joinpath(part)
                  if cursor.is_symlink():
                      raise SystemExit("agent proposal contains a symbolic link")
              if source_path.is_symlink() or not source_path.is_file():
                  raise SystemExit("agent proposal contains a non-regular file")

              source_stat = source_path.stat()
              if not stat.S_ISREG(source_stat.st_mode):
                  raise SystemExit("agent proposal contains a non-regular file")
              total_bytes += source_stat.st_size
              if total_bytes > maximum_total_bytes:
                  raise SystemExit("agent proposal exceeds the byte budget")
              validated.append((relative_path, source_path, source_stat.st_mode))

          for relative_path, source_path, source_mode in validated:
              target_path = target_root.joinpath(relative_path)
              cursor = target_root
              for part in relative_path.parts[:-1]:
                  cursor = cursor.joinpath(part)
                  if cursor.exists() and cursor.is_symlink():
                      raise SystemExit("trusted target path contains a symbolic link")
              if target_path.exists() and target_path.is_symlink():
                  raise SystemExit("trusted target file is a symbolic link")
              target_path.parent.mkdir(parents=True, exist_ok=True)
              temporary_path = target_path.with_name(f".{target_path.name}.agent-copy")
              shutil.copyfile(source_path, temporary_path)
              os.chmod(temporary_path, stat.S_IMODE(source_mode))
              os.replace(temporary_path, target_path)
          PY
          }

          chmod 0700 "$GITHUB_WORKSPACE" "$RUNNER_TEMP"
          for command_file in \
            "${GITHUB_ENV:-}" \
            "${GITHUB_PATH:-}" \
            "${GITHUB_OUTPUT:-}" \
            "${GITHUB_STATE:-}" \
            "${GITHUB_STEP_SUMMARY:-}"; do
            if [ -n "$command_file" ] && [ -e "$command_file" ]; then
              chmod 0600 "$command_file"
              chmod 0700 "$(dirname "$command_file")"
            fi
          done

          if ! id -u "$agent_user" >/dev/null 2>&1; then
            sudo useradd \
              --system \
              --no-create-home \
              --shell /usr/sbin/nologin \
              "$agent_user"
          fi
          trap 'cleanup_agent_processes || true' EXIT

          for model in $OPENCODE_MODEL_CANDIDATES; do
            candidate_index=$((candidate_index + 1))
            candidate_root="/tmp/diagramweave-agent-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${candidate_index}"
            proposal_root="$candidate_root/repository"
            model_home="$candidate_root/home"
            model_tmp="$candidate_root/tmp"
            proposal_git_snapshot="$RUNNER_TEMP/diagramweave-proposal-git-${candidate_index}"

            sudo rm -rf "$candidate_root"
            rm -rf "$proposal_git_snapshot"
            install -d -m 0700 "$candidate_root" "$model_home" "$model_tmp"
            trusted_git \
              -c protocol.file.allow=always \
              clone --no-hardlinks --no-tags "$GITHUB_WORKSPACE" "$proposal_root"
            trusted_git -C "$proposal_root" checkout --detach "$TRUSTED_HEAD_SHA"
            trusted_git -C "$proposal_root" remote remove origin
            printf '/opencode.json\n' >>"$proposal_root/.git/info/exclude"
            cp -- "$OPENCODE_CONFIG_PATH" "$proposal_root/opencode.json"
            cp -a -- "$proposal_root/.git" "$proposal_git_snapshot"
            sudo chown -R "$agent_user:$agent_user" "$candidate_root"

            echo "::group::opencode $model"
            model_succeeded=false
            if (
              cd "$proposal_root"
              sudo -u "$agent_user" \
                /usr/bin/env -i \
                  HOME="$model_home" \
                  TMPDIR="$model_tmp" \
                  XDG_CONFIG_HOME="$model_home/.config" \
                  XDG_CACHE_HOME="$model_home/.cache" \
                  XDG_DATA_HOME="$model_home/.local/share" \
                  XDG_STATE_HOME="$model_home/.local/state" \
                  PATH="$trusted_path" \
                  NVIDIA_API_KEY="$NVIDIA_API_KEY" \
                  CI=true \
                  LANG=C.UTF-8 \
                  LC_ALL=C.UTF-8 \
                  TERM=dumb \
                  /usr/bin/timeout \
                    --kill-after=30s \
                    "${OPENCODE_RUN_TIMEOUT_SECONDS}s" \
                    /usr/local/bin/opencode run "$prompt" --model "$model"
            ); then
              model_succeeded=true
            fi
            echo "::endgroup::"

            cleanup_agent_processes
            sudo chown -R "$(id -u):$(id -g)" "$candidate_root"
            chmod -R u+rwX "$candidate_root"
            restore_git_control_plane "$proposal_root" "$proposal_git_snapshot"

            proposal_status="$(
              trusted_git -C "$proposal_root" \
                status --porcelain --untracked-files=all
            )"
            meaningful_status="$(
              printf '%s\n' "$proposal_status" \
                | grep -vE '^\?\? PR_MESSAGE\.md$' || true
            )"

            if [ "$model_succeeded" = "true" ] && [ -n "$meaningful_status" ]; then
              import_proposal "$proposal_root" "$candidate_index"
              status=0
              echo "Agent session produced a bounded repository mutation with \`$model\`." \
                >>"$GITHUB_STEP_SUMMARY"
              rm -rf "$candidate_root" "$proposal_git_snapshot"
              break
            fi

            if [ "$model_succeeded" = "true" ]; then
              completed_without_mutation=$((completed_without_mutation + 1))
              echo "::warning::Model $model completed without a repository mutation; trying the next candidate."
            else
              echo "::warning::Model $model failed; discarding partial work and trying the next candidate."
            fi

            (
              cd "$proposal_root"
              trusted_git reset --hard HEAD
              trusted_git clean -fd
            )
            rm -rf "$candidate_root" "$proposal_git_snapshot"
          done

          cleanup_agent_processes
          trap - EXIT
          sudo userdel "$agent_user"

          if [ "$status" -ne 0 ]; then
            if [ "$EXECUTION_MODE" = "remediation" ] && \
               [ "$completed_without_mutation" -gt 0 ]; then
              echo "Every candidate failed or completed without a safe remediation mutation; leaving the exact head unchanged after candidate exhaustion." \
                >>"$GITHUB_STEP_SUMMARY"
              exit 0
            fi
            echo "::error::Every NVIDIA NIM model candidate failed or completed without a product mutation; no product increment was proposed."
            exit 1
          fi

      - name: Set up Node.js for exact repository verification
        if: steps.gate.outputs.dispatch == 'true'
        uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238
        with:
          node-version: 24
          package-manager-cache: false

      - name: Verify the proposed mutation
        id: verify
        if: steps.gate.outputs.dispatch == 'true'
        shell: bash
        env:
          EXECUTION_MODE: ${{ steps.gate.outputs.mode }}
          TRUSTED_HEAD_SHA: ${{ steps.trusted_git.outputs.head_sha }}
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"
          trusted_git_dir="$RUNNER_TEMP/diagramweave-trusted-git"
          trusted_git_home="$RUNNER_TEMP/diagramweave-trusted-git-home"

          trusted_git() {
            env -i \
              HOME="$trusted_git_home" \
              PATH=/usr/bin:/bin \
              LANG=C.UTF-8 \
              LC_ALL=C.UTF-8 \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              /usr/bin/git -c core.hooksPath=/dev/null "$@"
          }

          if id -u diagramweave-agent >/dev/null 2>&1; then
            echo "::error::The isolated model operating-system user still exists."
            exit 1
          fi
          observed_head_sha="$(trusted_git rev-parse HEAD)"
          if [ "$observed_head_sha" != "$TRUSTED_HEAD_SHA" ]; then
            echo "::error::The trusted repository HEAD changed before verification."
            exit 1
          fi
          cmp -- .git/config "$trusted_git_dir/config"
          cmp -- .git/HEAD "$trusted_git_dir/HEAD"
          diff -qr -- .git/refs "$trusted_git_dir/refs"
          diff -qr -- .git/info "$trusted_git_dir/info"
          diff -qr -- .git/hooks "$trusted_git_dir/hooks"
          if [ -f "$trusted_git_dir/packed-refs" ]; then
            cmp -- .git/packed-refs "$trusted_git_dir/packed-refs"
          elif [ -f .git/packed-refs ]; then
            echo "::error::A packed-ref file appeared after the trust snapshot."
            exit 1
          fi

          if [ "$EXECUTION_MODE" = "remediation" ]; then
            rm -f PR_MESSAGE.md
          fi
          meaningful_status="$(
            trusted_git status --porcelain --untracked-files=all \
              | grep -vE '^\?\? PR_MESSAGE\.md$' || true
          )"
          if [ -z "$meaningful_status" ]; then
            rm -f PR_MESSAGE.md
            echo "mutation=false" >>"$GITHUB_OUTPUT"
            if [ "$EXECUTION_MODE" = "product" ]; then
              echo "::error::Product-development mode completed without a repository mutation."
              echo "A clean model exit is not a completed product increment." \
                >>"$GITHUB_STEP_SUMMARY"
              exit 1
            fi
            echo "No safe remediation mutation was produced after candidate exhaustion." \
              >>"$GITHUB_STEP_SUMMARY"
            exit 0
          fi

          echo "mutation=true" >>"$GITHUB_OUTPUT"
          trusted_git diff --check
          npm ci --ignore-scripts --no-audit --no-fund
          npm run verify
          node scripts/check-package-contents.mjs

      - name: Prepare one bounded commit without repository credentials
        id: prepare_commit
        if: steps.gate.outputs.dispatch == 'true' && steps.verify.outputs.mutation == 'true'
        shell: bash
        env:
          EXECUTION_MODE: ${{ steps.gate.outputs.mode }}
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"
          trusted_git_home="$RUNNER_TEMP/diagramweave-trusted-git-home"
          title_file="$RUNNER_TEMP/pr-title.txt"
          body_file="$RUNNER_TEMP/pr-body.md"

          trusted_git() {
            env -i \
              HOME="$trusted_git_home" \
              PATH=/usr/bin:/bin \
              LANG=C.UTF-8 \
              LC_ALL=C.UTF-8 \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              /usr/bin/git -c core.hooksPath=/dev/null "$@"
          }

          title="fix: apply RCA-backed PR remediation"
          : >"$body_file"
          if [ "$EXECUTION_MODE" = "product" ]; then
            title="DiagramWeave autonomous product increment"
            if [ -f PR_MESSAGE.md ]; then
              candidate_title="$(head -n 1 PR_MESSAGE.md | sed 's/^#\+ *//')"
              [ -n "$candidate_title" ] && title="$candidate_title"
              tail -n +2 PR_MESSAGE.md >"$body_file"
            else
              echo "Autonomous NVIDIA NIM increment; see the diff and CHANGELOG.md." \
                >"$body_file"
            fi
          fi
          rm -f PR_MESSAGE.md

          if [ -z "$title" ] || [ "${#title}" -gt 200 ]; then
            echo "::error::The proposed commit title is empty or oversized."
            exit 1
          fi
          if printf '%s' "$title" | LC_ALL=C grep -q '[[:cntrl:]]'; then
            echo "::error::The proposed commit title contains control characters."
            exit 1
          fi
          if [ "$(wc -c <"$body_file")" -gt 131072 ]; then
            echo "::error::The proposed pull-request body is oversized."
            exit 1
          fi
          printf '%s\n' "$title" >"$title_file"

          trusted_git add -A
          trusted_git diff --cached --check
          if trusted_git diff --cached --quiet; then
            echo "::error::Verification reported a mutation but no commit content remains."
            exit 1
          fi
          # Trusted equivalent of: git commit --no-verify
          trusted_git \
            -c user.name=github-actions[bot] \
            -c user.email=41898282+github-actions[bot]@users.noreply.github.com \
            commit --no-verify -m "$title"
          commit_sha="$(trusted_git rev-parse HEAD)"
          if ! [[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::The prepared commit SHA is malformed."
            exit 1
          fi
          {
            echo "commit_sha=$commit_sha"
            echo "title_file=$title_file"
            echo "body_file=$body_file"
          } >>"$GITHUB_OUTPUT"

      - name: Publish one bounded mutation
        if: steps.gate.outputs.dispatch == 'true' && steps.verify.outputs.mutation == 'true'
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          EXECUTION_MODE: ${{ steps.gate.outputs.mode }}
          TARGET_PR_NUMBER: ${{ steps.gate.outputs.target_pr_number }}
          TARGET_HEAD_BRANCH: ${{ steps.gate.outputs.target_head_branch }}
          TARGET_HEAD_SHA: ${{ steps.gate.outputs.target_head_sha }}
          PREPARED_COMMIT_SHA: ${{ steps.prepare_commit.outputs.commit_sha }}
          PREPARED_TITLE_FILE: ${{ steps.prepare_commit.outputs.title_file }}
          PREPARED_BODY_FILE: ${{ steps.prepare_commit.outputs.body_file }}
          TRUSTED_HEAD_SHA: ${{ steps.trusted_git.outputs.head_sha }}
        run: |
          set -euo pipefail
          cd "$GITHUB_WORKSPACE"
          trusted_git_home="$RUNNER_TEMP/diagramweave-trusted-git-home"

          trusted_git() {
            env -i \
              HOME="$trusted_git_home" \
              PATH=/usr/bin:/bin \
              LANG=C.UTF-8 \
              LC_ALL=C.UTF-8 \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              /usr/bin/git -c core.hooksPath=/dev/null "$@"
          }

          prepared_commit_sha="$PREPARED_COMMIT_SHA"
          if ! [[ "$prepared_commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
            echo "::error::The prepared commit SHA is malformed."
            exit 1
          fi
          if [ "$(trusted_git rev-parse HEAD)" != "$prepared_commit_sha" ]; then
            echo "::error::The local HEAD no longer matches the verified prepared commit."
            exit 1
          fi

          git_basic_auth="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
          git_auth_header="AUTHORIZATION: basic $git_basic_auth"
          echo "::add-mask::$git_basic_auth"
          echo "::add-mask::$git_auth_header"

          if [ "$EXECUTION_MODE" = "remediation" ]; then
            expected_head_sha="$TARGET_HEAD_SHA"
            target_head_branch="$TARGET_HEAD_BRANCH"
            if ! trusted_git check-ref-format "refs/heads/$target_head_branch" >/dev/null; then
              echo "::error::The selected PR head branch is not a safe Git ref."
              exit 1
            fi
            remote_head_sha="$(
              gh pr view "$TARGET_PR_NUMBER" \
                --repo "$GITHUB_REPOSITORY" \
                --json headRefOid \
                --jq '.headRefOid'
            )"
            if [ "$remote_head_sha" != "$expected_head_sha" ]; then
              echo "::error::The PR head moved during remediation; refusing a stale push."
              exit 1
            fi

            # Trusted equivalent of: git push --no-verify
            GIT_CONFIG_COUNT=1 \
              GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
              GIT_CONFIG_VALUE_0="$git_auth_header" \
              GIT_CONFIG_NOSYSTEM=1 \
              GIT_CONFIG_GLOBAL=/dev/null \
              GIT_NO_REPLACE_OBJECTS=1 \
              HOME="$trusted_git_home" \
              /usr/bin/git -c core.hooksPath=/dev/null push --no-verify \
                "https://github.com/${GITHUB_REPOSITORY}.git" \
                "$prepared_commit_sha:refs/heads/${target_head_branch}"

            remote_head_sha="$(
              gh pr view "$TARGET_PR_NUMBER" \
                --repo "$GITHUB_REPOSITORY" \
                --json headRefOid \
                --jq '.headRefOid'
            )"
            if [ "$remote_head_sha" != "$prepared_commit_sha" ]; then
              echo "::error::Post-push exact-head verification failed."
              exit 1
            fi
            gh pr view "$TARGET_PR_NUMBER" \
              --repo "$GITHUB_REPOSITORY" \
              --json headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup \
              >"$RUNNER_TEMP/post-remediation-state.json"
            echo "Published one verified fast-forward remediation commit to PR #$TARGET_PR_NUMBER." \
              >>"$GITHUB_STEP_SUMMARY"
            exit 0
          fi

          latest_open_prs="$(
            gh pr list \
              --repo "$GITHUB_REPOSITORY" \
              --state open \
              --limit 1 \
              --json number,url
          )"
          if [ "$(jq 'length' <<<"$latest_open_prs")" -ne 0 ]; then
            echo "::error::A pull request appeared after the gate; refusing duplicate product work."
            exit 1
          fi
          current_base_sha="$(
            gh api \
              -H "Accept: application/vnd.github+json" \
              "repos/$GITHUB_REPOSITORY/git/ref/heads/$DEFAULT_BRANCH" \
              --jq '.object.sha'
          )"
          if [ "$current_base_sha" != "$TRUSTED_HEAD_SHA" ]; then
            echo "::error::Protected main moved during product development; refusing stale product work."
            exit 1
          fi

          title="$(cat "$PREPARED_TITLE_FILE")"
          body_file="$PREPARED_BODY_FILE"
          branch="nim-agent/product-dev-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
          if ! trusted_git check-ref-format "refs/heads/$branch" >/dev/null; then
            echo "::error::The product proposal branch is not a safe Git ref."
            exit 1
          fi

          # Trusted equivalent of: git push --no-verify
          GIT_CONFIG_COUNT=1 \
            GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
            GIT_CONFIG_VALUE_0="$git_auth_header" \
            GIT_CONFIG_NOSYSTEM=1 \
            GIT_CONFIG_GLOBAL=/dev/null \
            GIT_NO_REPLACE_OBJECTS=1 \
            HOME="$trusted_git_home" \
            /usr/bin/git -c core.hooksPath=/dev/null push --no-verify \
              "https://github.com/${GITHUB_REPOSITORY}.git" \
              "$prepared_commit_sha:refs/heads/${branch}"
          pr_url="$(
            gh pr create \
              --repo "$GITHUB_REPOSITORY" \
              --base "$DEFAULT_BRANCH" \
              --head "$branch" \
              --title "$title" \
              --body-file "$body_file"
          )"
          created_head_sha="$(
            gh pr view "$pr_url" \
              --repo "$GITHUB_REPOSITORY" \
              --json headRefOid \
              --jq '.headRefOid'
          )"
          if [ "$created_head_sha" != "$prepared_commit_sha" ]; then
            echo "::error::Created PR does not point to the verified commit."
            exit 1
          fi
          {
            echo "Opened exactly one bounded pull request: $pr_url"
            echo "Central PR governance owns review, repair, revalidation, and merge."
          } >>"$GITHUB_STEP_SUMMARY"
'''
workflow = replace_tail(
    workflow,
    "      - name: Install the pinned OpenCode CLI\n",
    new_tail,
    "workflow model/publisher tail",
)
workflow_path.write_text(workflow, encoding="utf-8")

workflow_contract_path = Path("tests/workflow-contract.test.js")
workflow_contract = workflow_contract_path.read_text(encoding="utf-8")
workflow_contract = replace_once(
    workflow_contract,
    "  assert.match(workflow, /env -u GH_TOKEN -u GITHUB_TOKEN -u REPOSITORY_TOKEN/);\n",
    "  assert.match(workflow, /sudo -u \\\"\\$agent_user\\\"[\\s\\S]*?env -i/);\n"
    "  assert.doesNotMatch(workflow, /REPOSITORY_TOKEN/);\n",
    "workflow clean-environment assertion",
)
workflow_contract = replace_once(
    workflow_contract,
    "  assert.match(publish, /HEAD:refs\\/heads\\/\\$\\{target_head_branch\\}/);\n",
    "  assert.match(\n"
    "    publish,\n"
    "    /prepared_commit_sha:refs\\/heads\\/\\$\\{target_head_branch\\}/,\n"
    "  );\n",
    "workflow prepared remediation commit assertion",
)
workflow_contract_path.write_text(workflow_contract, encoding="utf-8")

rca_contract_path = Path("tests/hourly-rca-action-contract.test.js")
rca_contract = rca_contract_path.read_text(encoding="utf-8")
rca_contract = replace_once(
    rca_contract,
    "  assert.match(publish, /HEAD:refs\\/heads\\/\\$\\{target_head_branch\\}/);\n",
    "  assert.match(\n"
    "    publish,\n"
    "    /prepared_commit_sha:refs\\/heads\\/\\$\\{target_head_branch\\}/,\n"
    "  );\n",
    "RCA prepared remediation commit assertion",
)
rca_contract_path.write_text(rca_contract, encoding="utf-8")

security_path = Path("docs/security-model.md")
security = security_path.read_text(encoding="utf-8")
security_anchor = """### Contextual Orchestrator transport boundary
"""
security_section = """### Autonomous development process boundary

The hourly development model runs as a **separate operating-system user** inside a **disposable local clone**, never in the trusted checkout. The model receives a clean `env -i` environment containing only its dedicated `HOME`/`TMPDIR`/XDG directories, a fixed executable path, locale values, and `NVIDIA_API_KEY`. Repository credentials, Actions OIDC variables, and **GitHub command files** are absent and inaccessible. The trusted checkout and runner command-file directories remain owner-only while the model runs.

After every candidate, the trusted shell kills and verifies the absence of every process owned by the model user, preventing a **detached background process** from surviving into a token-bearing step. It then discards model-controlled `.git` state, restores the disposable clone's snapshotted **Git control plane**, disables hooks, and compares the resulting worktree to the exact trusted SHA. Only a bounded binary patch and validated regular untracked files may cross into the trusted checkout; symbolic links, special files, unsafe paths, excessive file counts, and excessive bytes fail closed.

Complete verification runs before a **token-free commit** is prepared with **hooks disabled**. The later publisher receives a step-scoped GitHub token, cannot stage or commit model output, revalidates the exact remote head or protected-main tip, and may only push the already verified commit with hooks disabled. Model-process success, proposal import, commit preparation, review, merge, and release remain separate authorities.

"""
security = replace_once(
    security,
    security_anchor,
    security_section + security_anchor,
    "security autonomous boundary",
)
security = replace_once(
    security,
    "| Hidden automatic mutation | Core returns values only; approval and write action are separate |\n",
    "| Hidden automatic mutation | Core returns values only; approval and write action are separate |\n"
    "| Model persists Git hooks/config/refs | separate OS user and disposable clone; restored Git control plane; hooks disabled |\n"
    "| Model poisons GitHub command files | command files remain owner-only and absent from the clean model environment |\n"
    "| Model leaves a background process for a later token step | kill and verify every process for the dedicated model user before verification/publication |\n",
    "security threat rows",
)
security_path.write_text(security, encoding="utf-8")

operations_path = Path("docs/operations/hourly-development.md")
operations = operations_path.read_text(encoding="utf-8")
operations_anchor = """### Common verification boundary
"""
operations_section = """### Autonomous model isolation boundary

Each candidate runs as a **separate operating-system user** in a **disposable local clone**. The trusted checkout, repository credentials, GitHub command files, and Actions OIDC request values are not present in the model environment. The candidate receives only an isolated home/temp/config tree, the pinned OpenCode executable, the NVIDIA credential, the bounded prompt, and its disposable repository clone.

When a candidate returns, the trusted shell kills any detached process owned by that user, restores the clone's snapshotted **Git control plane**, and disables hooks before calculating a proposal. Only a bounded patch plus regular, non-symlink, non-special untracked files may be imported. Candidate `.git` configuration, hooks, refs, object alternates, replacement refs, and ignored build output never cross the boundary.

After complete repository verification, a separate step creates a **token-free commit** with **hooks disabled**. Only the final publisher receives a step-scoped GitHub token. It cannot stage or commit, and it pushes only the exact prepared commit after live head/base revalidation with hooks disabled.

"""
operations = replace_once(
    operations,
    operations_anchor,
    operations_section + operations_anchor,
    "operations isolation boundary",
)
operations_path.write_text(operations, encoding="utf-8")

adr_path = Path("docs/adr/0007-automation-authority.md")
adr = adr_path.read_text(encoding="utf-8")
adr_anchor = """A successful model-process exit is runtime evidence only, not proof of a completed repository proposal. In product-development mode, the trusted boundary requires a meaningful non-metadata working-tree mutation before deterministic verification or publication can proceed. A clean no-op candidate is reset and the next configured model is attempted; exhaustion without a product mutation is a visible workflow failure. Remediation may leave an exact PR head unchanged only after the bounded candidate set is exhausted without a safe mutation.

"""
adr_addition = adr_anchor + """The model process must execute as a **separate operating-system user** in a **disposable local clone** with no repository token, GitHub command-file path, Actions OIDC value, or access to the trusted checkout. Its `.git` directory is never trusted: the shell restores a snapshotted **Git control plane**, kills detached model processes, and imports only bounded regular-file worktree changes. Deterministic verification precedes a **token-free commit** with **hooks disabled**. The token-bearing publisher cannot stage or commit and can push only that exact verified commit after live ref revalidation, also with hooks disabled.

"""
adr = replace_once(
    adr,
    adr_anchor,
    adr_addition,
    "ADR isolation decision",
)
adr_path.write_text(adr, encoding="utf-8")

threat_path = Path("docs/THREAT_MODEL.md")
threat = threat_path.read_text(encoding="utf-8")
threat = replace_once(
    threat,
    "**Last reviewed:** 2026-08-09",
    "**Last reviewed:** 2026-08-12",
    "threat-model review date",
)
threat = replace_once(
    threat,
    "| autonomous model self-merge/release | governance bypass | model/verification/publication/review/release authority separation |\n",
    "| autonomous model self-merge/release | governance bypass | model/verification/publication/review/release authority separation |\n"
    "| model-controlled Git hooks/config/refs | token theft or trusted-step code execution | separate OS user, disposable clone, restored Git control plane, hooks disabled |\n"
    "| GitHub command-file poisoning | inject environment/PATH into later steps | command files owner-only and absent from clean model environment |\n"
    "| detached model process | observe or attack later token-bearing publication | kill/verify all dedicated-user processes before later steps; delete user |\n",
    "threat-model autonomous rows",
)
threat = replace_once(
    threat,
    "- CI credential/action pinning and model-publication authority separation.\n",
    "- CI credential/action pinning and model-publication authority separation;\n"
    "- model-user isolation, command-file denial, disposable-clone Git restoration, bounded proposal import, detached-process cleanup, token-free commit, and hook-free publication.\n",
    "threat-model adversarial tests",
)
threat_path.write_text(threat, encoding="utf-8")

trd_path = Path("docs/TRD.md")
trd = trd_path.read_text(encoding="utf-8")
trd = replace_once(
    trd,
    "- autonomous development credentials and merge/release authority remain separated.\n",
    "- autonomous development credentials and merge/release authority remain separated;\n"
    "- autonomous model execution uses a separate operating-system user and disposable local clone, restores the Git control plane, imports only bounded regular-file worktree changes, prepares a token-free commit with hooks disabled, and exposes repository authority only to the final exact-commit publisher.\n",
    "TRD autonomous isolation invariant",
)
trd_path.write_text(trd, encoding="utf-8")

architecture_path = Path("docs/architecture.md")
architecture = architecture_path.read_text(encoding="utf-8")
architecture_anchor = """## Modular MSA compatibility
"""
architecture_section = """## Autonomous development isolation

```mermaid
flowchart LR
    T[Trusted exact checkout] --> C[Disposable local clone]
    C --> U[Separate model OS user\nclean env + NVIDIA only]
    U --> R[Kill detached processes\nrestore clone Git control plane]
    R --> I[Bounded regular-file proposal import]
    I --> V[Complete deterministic verification]
    V --> K[Token-free commit\nhooks disabled]
    K --> P[Step-scoped publisher token\nlive ref revalidation]
    P --> Q[Review candidate PR]
```

The model never runs in the trusted checkout. It may mutate only a disposable clone owned by a separate operating-system user. The trusted boundary restores clone Git metadata, rejects symbolic links/special files/unsafe paths and bounded-resource violations, and imports only worktree content. The model user and every process it owns are removed before verification. A token-free commit is prepared with hooks disabled; the final publisher cannot stage or commit and can only push the exact verified commit after live branch/base validation.

"""
architecture = replace_once(
    architecture,
    architecture_anchor,
    architecture_section + architecture_anchor,
    "architecture automation isolation",
)
architecture_path.write_text(architecture, encoding="utf-8")

test_strategy_path = Path("docs/TEST_STRATEGY.md")
test_strategy = test_strategy_path.read_text(encoding="utf-8")
test_strategy = replace_once(
    test_strategy,
    "Mirror `docs/THREAT_MODEL.md`: source/model prompt injection boundaries, child environment isolation, raw diagnostic minimization, symlink/output safety, provider endpoint validation, stale-state races, URI/source reflection, and autonomous credential/merge-authority separation.\n",
    "Mirror `docs/THREAT_MODEL.md`: source/model prompt injection boundaries, child environment isolation, raw diagnostic minimization, symlink/output safety, provider endpoint validation, stale-state races, URI/source reflection, autonomous credential/merge-authority separation, separate-user disposable-clone execution, Git control-plane restoration, command-file denial, detached-process cleanup, bounded regular-file proposal import, token-free commit preparation, and hook-free exact-commit publication.\n",
    "test strategy autonomous security coverage",
)
test_strategy_path.write_text(test_strategy, encoding="utf-8")

traceability_path = Path("docs/TRACEABILITY.md")
traceability = traceability_path.read_text(encoding="utf-8")
traceability = replace_once(
    traceability,
    "| work-conserving hourly remediation | ADR-0007; PR #24 | GitHub workflows | workflow-contract tests and protected-main CI/security evidence | implemented-main |\n",
    "| work-conserving hourly remediation | ADR-0007; PR #24 | GitHub workflows | workflow-contract tests and protected-main CI/security evidence | implemented-main |\n"
    "| isolated autonomous proposal generation | ADR-0007; PR #26 | disposable model clone + trusted publisher | isolation/no-op workflow contracts, complete verification, exact-head security/review evidence | active-PR |\n",
    "traceability isolation row",
)
traceability_path.write_text(traceability, encoding="utf-8")

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
changelog = replace_once(
    changelog,
    "### Security\n\n",
    "### Security\n\n"
    "- Autonomous OpenCode candidates now run as a separate operating-system user\n"
    "  in disposable local clones with clean environments. The trusted boundary\n"
    "  kills detached processes, restores Git metadata, imports only bounded\n"
    "  regular-file proposals, prepares a token-free commit with hooks disabled,\n"
    "  and grants the final publisher authority only to push that exact commit.\n",
    "changelog security entry",
)
changelog_path.write_text(changelog, encoding="utf-8")

Path(".github/workflows/repair-hourly-agent-isolation.yml").unlink()
Path("scripts/repair-hourly-agent-isolation.py").unlink()
