import { readFile, writeFile } from 'node:fs/promises';

const rendererPath = 'packages/plantuml-renderer/src/renderer.js';
const hardeningTestPath = 'packages/plantuml-renderer/test/hardening.test.js';

/**
 * Replace one exact source fragment and fail closed when the expected base has drifted.
 *
 * @param {string} text - Current UTF-8 file contents.
 * @param {string} before - Exact reviewed source fragment.
 * @param {string} after - Exact replacement source fragment.
 * @param {string} label - Stable diagnostic label.
 * @returns {string} Updated contents.
 */
function replaceExactly(text, before, after, label) {
  const occurrences = text.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one source fragment, found ${occurrences}.`);
  }
  return text.replace(before, after);
}

const renderer = await readFile(rendererPath, 'utf8');
const validationStart = renderer.indexOf(
  '/**\n * Find an XML tag end while respecting quoted attribute values.',
);
const validationEnd = renderer.indexOf(
  '/**\n * Inspect the bounded PlantUML standard report without exposing its contents.',
);
if (validationStart === -1 || validationEnd === -1 || validationStart >= validationEnd) {
  throw new Error('Renderer validation section markers do not match the reviewed base.');
}

const validationBlock = `/**
 * Read one conservative XML element or document-type name.
 *
 * PlantUML SVG uses ASCII XML names. Restricting this boundary to the XML
 * characters used by SVG avoids accepting malformed markup while preserving
 * every renderer-produced element and namespace prefix.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Candidate name start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {{name: string, end: number}|null} Name and first following index.
 */
function readXmlName(text, index, boundary) {
  const first = text[index];
  if (first === undefined || !/[A-Za-z_:]/u.test(first)) {
    return null;
  }
  let cursor = index + 1;
  while (cursor < boundary && /[A-Za-z0-9_.:-]/u.test(text[cursor])) {
    cursor += 1;
  }
  return { name: text.slice(index, cursor), end: cursor };
}

/**
 * Find an XML tag end while respecting quoted attribute values.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the opening angle bracket.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} Closing angle-bracket index, or -1 when incomplete.
 */
function findTagEnd(text, index, boundary) {
  let quote = null;
  for (let cursor = index; cursor < boundary; cursor += 1) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor;
    }
  }
  return -1;
}

/**
 * Find the end of a bounded processing instruction or CDATA section.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the opening delimiter.
 * @param {string} delimiter - Closing delimiter.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the delimiter, or -1 when incomplete.
 */
function findDelimitedMarkupEnd(text, index, delimiter, boundary) {
  const end = text.indexOf(delimiter, index);
  return end === -1 || end + delimiter.length > boundary
    ? -1
    : end + delimiter.length;
}

/**
 * Find a well-formed XML comment end.
 *
 * XML comments may not contain an embedded double hyphen. This check keeps
 * malformed comments from hiding element boundaries from the stack scanner.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} start - Comment opening delimiter index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the comment, or -1 when malformed.
 */
function findCommentEnd(text, start, boundary) {
  const end = text.indexOf('-->', start + 4);
  if (end === -1 || end + 3 > boundary) {
    return -1;
  }
  const embeddedDoubleHyphen = text.indexOf('--', start + 4);
  return embeddedDoubleHyphen !== -1 && embeddedDoubleHyphen < end
    ? -1
    : end + 3;
}

/**
 * Find the end of one XML document type declaration.
 *
 * The scanner respects quoted identifiers and an optional internal subset so
 * nested greater-than characters do not terminate the declaration early.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the declared root name.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the declaration, or -1 when malformed.
 */
function findDoctypeEnd(text, index, boundary) {
  let quote = null;
  let subsetDepth = 0;
  for (let cursor = index; cursor < boundary; cursor += 1) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      subsetDepth += 1;
    } else if (character === ']') {
      if (subsetDepth === 0) {
        return -1;
      }
      subsetDepth -= 1;
    } else if (character === '>' && subsetDepth === 0) {
      return cursor + 1;
    }
  }
  return -1;
}

/**
 * Return whether a processing instruction uses the reserved XML target.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Processing-instruction start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {boolean} True for a case-insensitive XML target boundary.
 */
function isXmlDeclarationTarget(text, index, boundary) {
  const targetEnd = index + 5;
  if (targetEnd >= boundary || !matchesAsciiToken(text, index, '<?xml')) {
    return false;
  }
  const character = text[targetEnd];
  return character === '?' || isDocumentWhitespace(character);
}

/**
 * Skip the restricted XML prologue accepted before the SVG root.
 *
 * One XML declaration may appear first. Comments, non-XML processing
 * instructions, and one DOCTYPE whose declared root is exactly \\`svg\\` may
 * follow. Other declarations and malformed nodes fail closed.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First non-whitespace document index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number|false} First actual element index, or false when malformed.
 */
function skipSvgPrologue(text, index, boundary) {
  let cursor = index;
  let sawNode = false;
  let sawDoctype = false;
  while (cursor < boundary) {
    if (isXmlDeclarationTarget(text, cursor, boundary)) {
      if (sawNode) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 5, '?>', boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<!--', cursor)) {
      const end = findCommentEnd(text, cursor, boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<?', cursor)) {
      const end = findDelimitedMarkupEnd(text, cursor + 2, '?>', boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (
      matchesAsciiToken(text, cursor, '<!doctype') &&
      cursor + 9 < boundary &&
      isDocumentWhitespace(text[cursor + 9])
    ) {
      if (sawDoctype) {
        return false;
      }
      const nameStart = skipDocumentWhitespace(text, cursor + 9, boundary, 1);
      const declaredRoot = readXmlName(text, nameStart, boundary);
      if (declaredRoot === null || declaredRoot.name !== 'svg') {
        return false;
      }
      const end = findDoctypeEnd(text, declaredRoot.end, boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      sawDoctype = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<!', cursor)) {
      return false;
    }
    return cursor;
  }
  return cursor;
}

/**
 * Parse one opening or closing XML element token.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} start - Opening angle-bracket index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {{kind: 'open'|'close', name: string, end: number, selfClosing: boolean}|false} Parsed token or false.
 */
function parseElementToken(text, start, boundary) {
  const isClosing = text[start + 1] === '/';
  const name = readXmlName(text, start + (isClosing ? 2 : 1), boundary);
  if (name === null) {
    return false;
  }
  const tagEnd = findTagEnd(text, name.end, boundary);
  if (tagEnd === -1) {
    return false;
  }
  if (isClosing) {
    const suffixStart = skipDocumentWhitespace(text, name.end, tagEnd, 1);
    if (suffixStart !== tagEnd) {
      return false;
    }
    return { kind: 'close', name: name.name, end: tagEnd + 1, selfClosing: false };
  }
  return {
    kind: 'open',
    name: name.name,
    end: tagEnd + 1,
    selfClosing: text[tagEnd - 1] === '/',
  };
}

/**
 * Validate one complete SVG element tree with an exact element-name stack.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - SVG root start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {boolean} True for one well-formed SVG element tree.
 */
function scanSvgElementTree(text, index, boundary) {
  const elementStack = [];
  let cursor = index;
  let sawRoot = false;
  while (cursor < boundary) {
    if (text[cursor] !== '<') {
      if (elementStack.length === 0) {
        return false;
      }
      const nextTag = text.indexOf('<', cursor);
      cursor = nextTag === -1 ? boundary : nextTag;
      continue;
    }
    if (text.startsWith('<!--', cursor)) {
      if (elementStack.length === 0) {
        return false;
      }
      const end = findCommentEnd(text, cursor, boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<![CDATA[', cursor)) {
      if (elementStack.length === 0) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 9, ']]>', boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<?', cursor)) {
      if (elementStack.length === 0 || isXmlDeclarationTarget(text, cursor, boundary)) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 2, '?>', boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<!', cursor)) {
      return false;
    }

    const element = parseElementToken(text, cursor, boundary);
    if (element === false) {
      return false;
    }
    cursor = element.end;
    if (element.kind === 'open') {
      if (elementStack.length === 0) {
        if (sawRoot || element.name.toLowerCase() !== 'svg') {
          return false;
        }
        sawRoot = true;
      }
      if (!element.selfClosing) {
        elementStack.push(element.name);
      }
      continue;
    }
    if (
      elementStack.length === 0 ||
      elementStack[elementStack.length - 1] !== element.name
    ) {
      return false;
    }
    elementStack.pop();
  }
  return sawRoot && elementStack.length === 0;
}

/**
 * Return whether output is one complete well-formed UTF-8 SVG document.
 *
 * The validator decodes once, accepts only a restricted XML prologue, anchors
 * the first element to SVG, and tracks every opening element on an exact-name
 * stack so mismatched or incomplete nesting fails closed.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @returns {boolean} True for exactly one complete SVG document.
 */
function isValidSvg(output) {
  let text;
  try {
    text = utf8Decoder.decode(output);
  } catch {
    return false;
  }

  const first = skipDocumentWhitespace(text, 0, text.length, 1);
  const boundary = skipDocumentWhitespace(text, text.length, first, -1);
  if (first === boundary) {
    return false;
  }
  const rootStart = skipSvgPrologue(text, first, boundary);
  return rootStart !== false && rootStart !== boundary
    ? scanSvgElementTree(text, rootStart, boundary)
    : false;
}

/**
 * Validate output bytes for the requested media type.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @param {'png'|'svg'} format - Requested output format.
 * @returns {boolean} True when the output has the expected complete structure.
 */
function isValidOutput(output, format) {
  return format === 'png' ? isValidPng(output) : isValidSvg(output);
}

`;

const updatedRenderer = `${renderer.slice(0, validationStart)}${validationBlock}${renderer.slice(validationEnd)}`;
await writeFile(rendererPath, updatedRenderer);

let hardeningTest = await readFile(hardeningTestPath, 'utf8');
hardeningTest = replaceExactly(
  hardeningTest,
  `    '<?xml version="1.0"?><!-- generated --><?plantuml 1.2026.7?><!DOCTYPE svg><svg/>',\n    '<svg><svg/><svg></svg></svg>',`,
  `    '<?xml version="1.0"?><!-- generated --><?plantuml 1.2026.7?><!DOCTYPE svg><svg/>',\n    '<?xml-stylesheet href="theme.css"?><svg/>',\n    '<svg><g><text>hello</text></g></svg>',\n    '<SVG><g/></SVG>',\n    '<svg><svg/><svg></svg></svg>',`,
  'accepted SVG tree cases',
);
hardeningTest = replaceExactly(
  hardeningTest,
  `    '<!DOCTYPE html><svg/>',\n    '<!DOCTYPE svg [<!ELEMENT svg ANY><svg/>',`,
  `    '<!DOCTYPE html><svg/>',\n    '<!DOCTYPE svgx><svg/>',\n    '<!DOCTYPE svg [<!ELEMENT svg ANY><svg/>',`,
  'DOCTYPE root-name regression',
);
hardeningTest = replaceExactly(
  hardeningTest,
  `    '<svg><?instruction</svg>',\n    '<html></html>',`,
  `    '<svg><?instruction</svg>',\n    '<svg><?xml version="1.0"?></svg>',\n    '<svg><!-- invalid--comment --></svg>',\n    '<svg><!ENTITY x "y"></svg>',\n    '<html></html>',\n    '<1svg/>',`,
  'malformed XML token regressions',
);
hardeningTest = replaceExactly(
  hardeningTest,
  `    '<svg><g></g>',\n    '<svg><svg/>',`,
  `    '<svg><g></g>',\n    '<svg><g></svg>',\n    '<svg><g></path></svg>',\n    '<SVG></svg>',\n    '<svg></g></svg>',\n    '<svg><svg/>',`,
  'mismatched XML nesting regressions',
);
hardeningTest = replaceExactly(
  hardeningTest,
  `    '<svg></svg>trailing',\n    '<svg/><svg/>',`,
  `    '<svg></svg>trailing',\n    '<svg/><!-- trailing -->',\n    '<svg/><svg/>',`,
  'trailing XML node regressions',
);
await writeFile(hardeningTestPath, hardeningTest);
