'use strict';

const _ = require('underscore-plus');
const {last, head} = require('../utils');
const {openExampleInWebURL} = require('../urls');
const {section, renderExample} = require('./html-utils');

const escapeHTML = str =>
  str
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const removeWrapper = str =>
  str
  .replace('<pre class="editor editor-colors">', '')
  .replace('<div class="line">', '')
  .replace('</div>', '')
  .replace('</pre>', '');

const wrapLine = str => `<div class="line">${str}</div>`;

const wrapPre = str => `<pre class="editor editor-colors">${str}</pre>`;

const splitByLine = str => str.split('\n').reduce((m, l, i) => {
  return m.concat({
    start: last(m) ? last(m).end + 1 : 0,
    end: last(m) ? last(m).end + 1 + l.length : l.length,
    content: l,
    line: i,
  });
}, []);


const escapeString = (string) => {
  return string.replace(/[&"'<> ]/g, (match) => {
    switch (match) {
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case ' ': return '&nbsp;';
      default: return match;
    }
  });
};

const updateScopeStack = (scopeStack, desiredScopes, html) => {
  let i;
  let excessScopes = scopeStack.length - desiredScopes.length;
  if (excessScopes > 0) {
    while (excessScopes--) { html = popScope(scopeStack, html); }
  }

  // pop until common prefix
  for (i = scopeStack.length, asc = scopeStack.length <= 0; asc ? i <= 0 : i >= 0; asc ? i++ : i--) {
    var asc;
    if (_.isEqual(scopeStack.slice(0, i), desiredScopes.slice(0, i))) { break; }
    html = popScope(scopeStack, html);
  }

  // push on top of common prefix until scopeStack is desiredScopes
  for (let j = i, end = desiredScopes.length, asc1 = i <= end; asc1 ? j < end : j > end; asc1 ? j++ : j--) {
    html = pushScope(scopeStack, desiredScopes[j], html);
  }

  return html;
};

const scopePrefix = 'syntax--';

const pushScope = (scopeStack, scope, html) => {
  scopeStack.push(scope);
  if (scope) {
    let className = scopePrefix + scope.replace(/\.+/g, ` ${scopePrefix}`);
    return html += `<span class=\"${className}\">`;
  } else {
    return html += '<span>';
  }
};

const popScope = (scopeStack, html) => {
  scopeStack.pop();
  return html += '</span>';
};

const highlights = ({fileContents, scopeName}) => {
  const grammar = atom.grammars.grammarForScopeName(scopeName);

  const lineTokens = grammar.tokenizeLines(fileContents);

  if (lineTokens.length > 0) {
    const lastLineTokens = lineTokens[lineTokens.length - 1];

    if ((lastLineTokens.length === 1) && (lastLineTokens[0].value === '')) {
      lineTokens.pop();
    }
  }

  let html = '';
  for (let tokens of Array.from(lineTokens)) {
    let scopeStack = [];
    for (let {value, scopes} of Array.from(tokens)) {
      if (!value) { value = ' '; }
      html = updateScopeStack(scopeStack, scopes, html);
      html += `<span>${escapeString(value)}</span>`;
    }
    while (scopeStack.length > 0) { html = popScope(scopeStack, html); }
  }

  return html;
};

const highlightChunk = (chunk) =>
  highlights({
    fileContents: chunk,
    scopeName: 'source.python',
  });

const refLink = (content, ref) =>
  `<a href="kite-atom-internal://value/${ref.fully_qualified}">${content}</a>`;

const processReferences = (line, references) => {
  const res = (references || []).reduce((o, ref) => {

    if (ref.begin >= o.start && ref.end <= o.end) {
      const prefix = o.remain.slice(0, ref.begin - o.start);
      const reference = o.remain.slice(ref.begin - o.start, ref.end - o.start);
      const postfix = o.remain.slice(ref.end - o.start);
      o.start = ref.end;
      o.remain = postfix;

      o.plain.push(removeWrapper(highlightChunk(prefix)));
      o.references.push(refLink(removeWrapper(highlightChunk(reference)), ref));
    }
    return o;
  }, {
    plain: [],
    references: [],
    remain: line.content,
    start: line.start,
    end: line.end,
  });

  return res.plain.map((p, i) => p + res.references[i]).join('') +
         removeWrapper(highlightChunk(res.remain));
};

const wrapReferences = (lines, references) =>
  lines.map(line => processReferences(line, references));

const fileEntry = file =>
  `<li class='list-item'>
      <span class='icon icon-file-text'
            data-name="${file.name}">${file.name}</span>
  </li>`;

const isDir = l => l.mime_type === 'application/x-directory';

const dirEntry = dir => {
  const {listing} = dir;

  return `
  <li class='list-nested-item'>
    <div class='list-item'>
      <span class='icon icon-file-directory'
            data-name="${dir.name}">${dir.name}</span>
    </div>

    <ul class='list-tree'>${
      listing.map(l => isDir(l) ? dirEntry(l) : fileEntry(l)).join('')
    }</ul>
  </li>`;
};

const OUTPUTS = {
  image: part =>
    `<figcaption class="list-item"><span class='icon icon-file-text'
          data-name="${part.content.path}">${part.content.path}</span></figcaption>
     <img src="data:;base64,${part.content.data}" title="${part.content.path}">
    `,
  plaintext: part =>
    `<pre class="output"><code>${escapeHTML(part.content.value)}</code></pre>`,
  directory_listing_table: part => {
    const {caption, entries} = part.content;
    const columns = Object.keys(head(entries));

    return `
    <figcaption>${caption}</figcaption>
    <table>
      <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
      ${
        entries.map(e => `<tr>${
          columns.map(c => `<td>${e[c]}</td>`).join('')
        }</tr>`).join('')
      }
    </table>`;
  },
  directory_listing_tree: part => {
    const {caption, entries} = part.content;

    return `
    <figcaption>${caption}</figcaption>
    <ul class='list-tree root'>${dirEntry(entries)}</ul>
    `;
  },
  file: part =>
    `<figcaption class="list-item"><span class='icon icon-file-text'
          data-name="${part.content.caption}">${part.content.caption}</span></figcaption>
    <pre class="input"><code>${escapeHTML(atob(part.content.data))}</code></pre>`,
};


function processContent(content) {
  return wrapPre(
    wrapReferences(
      splitByLine(content.code),
      content.references
    ).map(wrapLine).join('')
  );
}


function processOutput(part) {
  return part.output_type && OUTPUTS[part.output_type]
    ? OUTPUTS[part.output_type](part)
    : `<pre><code>${JSON.stringify(part, null, 2)}</code></pre>`;
}

class KiteCuratedExample extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-curated-example', {
      prototype: this.prototype,
    });
  }

  setData(data) {
    // console.log(JSON.stringify(data, null, 2));
    const html = data.prelude.concat(data.code).concat(data.postlude)
    .map(part => {
      if (part.type === 'code') {
        return processContent(part.content);
      } else if (part.type === 'output') {
        return processOutput(part);
      }

      return `<pre><code>${JSON.stringify(part, null, 2)}</code></pre>`;
    })
    .join('');
    const inputFiles = data.inputFiles;
    const inputHTML = inputFiles && inputFiles.length
      ? `<h5>Files used in this example</h5>
      ${inputFiles.map(f => {
        return `<figcaption class="list-item">
          <span class='icon icon-file-text'
                data-name="${f.name}">${f.name}</span>
          </figcaption><pre class="input"><code>${atob(f.contents_base64)}</code></pre>`;
      }).join('')}
      `
      : '';

    const relatedHTML = data.related && data.related.length
      ? section('Related Examples', `
        <ul>${data.related.map(renderExample).join('')}</ul>`)
      : '';

    this.innerHTML = `
      <div class="example-wrapper">
        <div class="example-code">${html}</div>
        ${inputHTML}
        <div class="related-examples">${relatedHTML}</div>
      </div>
      <footer>
        <div></div>
        <kite-open-link data-url="${openExampleInWebURL(data.id)}"></kite-open-link>
      </footer>
    `;
  }
}

module.exports = KiteCuratedExample.initClass();
