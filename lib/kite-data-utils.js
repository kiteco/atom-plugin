'use strict';

const {
  compact,
  flatten,
  head,
  last,
  uniq,
  detailGet,
  detailNotEmpty,
  detailLang,
  getFunctionDetails,
  idToDottedPath,
} = require('./utils');
const { escapeHTML, highlightChunk } = require('./highlighter');
const { UNKNOWN_TYPE } = require('./constants');

const idIsEmpty = (id) =>
  !id || id === '';

const isFunctionKind = kind => ['function', 'type'].includes(kind);

const parameterName = (p, prefix = '', w) =>
  p
    ? (
      w
        ? `<${w}>${prefix}<span class="syntax--source"><span class="syntax--variable syntax--parameter syntax--function parameter-name">${p.name}</span></span></${head(w.split(/\s/g))}>`
        : `${prefix}<span class="syntax--python"><span class="syntax--variable syntax--parameter syntax--function parameter-name">${p.name}</span></span>`
    )
    : undefined;

const parameterDefault = (p) => {
  if (!p) { return ''; }

  const lang = detailLang(p);

  switch (lang) {
    case 'python':
    case 'javascript':
      return detailNotEmpty(p, 'default_value')
        ? '<span class="syntax--source"><span class="syntax--keyword syntax--operator syntax--assignment">=</span></span>' +
        `<span class="parameter-default">${highlightChunk(head(detailGet(p, 'default_value')).repr)}</span>`
        : '';
    default:
      return '';
  }
};

const parameterType = (p, prefix = '') =>
  p.inferred_value
    ? `${prefix}${uniq(compact(p.inferred_value)
      .slice(0, 3) //only take the first 3 for UI purposes
      .map(v =>
        `<a href="kite-atom-internal://type/${v.type_id}" class="parameter-type">${v.type}</a>`))
      .join('<span class="type-separator">&#8910;</span>')}`
    : '';

const parameterValue = p =>
  `${parameterName(p)}${parameterType(p, ':')}${parameterDefault(p)}`;


const parameters = (d, withType = true, keywordOnly = false) =>
  d.parameters
    ? (withType
      ? d.parameters.filter(p => keywordOnly === detailGet(p, 'keyword_only')).map(parameterValue)
      : d.parameters.filter(p => keywordOnly === detailGet(p, 'keyword_only')).map(p => `${parameterName(p)}${parameterDefault(p)}`))
    : [];

const gatherParameters = (detail, withType) => {
  const lang = detailLang(detail);
  const keywordOnly = parameters(detail, withType, true);
  const vararg = detailGet(detail, 'vararg') || (keywordOnly.length > 0 && { name: '' });
  switch (lang) {
    case 'python':
      return [
        parameters(detail, withType, false),
        parameterName(vararg, '*'),
        keywordOnly,
        parameterName(detailGet(detail, 'kwarg'), '**', 'a class="kwargs" href="#"'),
      ];
    case 'javascript':
      return [
        parameters(detail, withType),
        parameterName(detailGet(detail, 'rest'), '…'),
      ];
    default:
      return [
        parameters(detail, withType),
      ];
  }
};

const signature = (data, withType = true, current = -1) => {
  const detail = getFunctionDetails(data);
  return detail
    ? `<span class="signature">${
    compact(flatten(gatherParameters(detail, withType)))
      .map((p, i, a) => {
        const s = i === a.length - 1 ? '' : ', ';
        return i === current
          ? `<span class="parameter parameter-highlight">${p}${s}</span>`
          : `<span class="parameter">${p}${s}</span>`;
      })
      .join('')
    }</span>`
    : '<span class="signature"></span>';
};

const callParameterName = (parameter) => parameter.name;

const callKwargParameter = (parameter, withType) => {
  const example = head(parameter.types.filter(t => t.examples));
  return example
    ? compact([
      callParameterName(parameter),
      head(example.examples).replace(/"'/g, "'").replace(/'"/g, "'"),
    ]).join('=')
    : callParameterName(parameter);
};

const callKwargParameters = (signature, withType) =>
  detailNotEmpty(signature, 'kwargs')
    ? detailGet(signature, 'kwargs').map(p => callKwargParameter(p)).join(', ')
    : null;

const callSignature = (data) =>
  compact(flatten([
    (data.args || []).map(callParameterName),
    callKwargParameters(data),
  ]))
    .join(', ');

const valueName = value =>
  last(last(value.repr.replace(/\(|\)/g, '').split('|').map(s => s.trim().split(':'))));

const valueNameFromId = value =>
  value.id
    ? last(value.id.split(/[;.]/g))
    : last(head(value.value).id.split(/[;.]/g));

const valueLabel = (value, current) =>
  isFunctionKind(value.kind)
    ? highlightChunk(valueName(value) + '(') + '\u200b' + // \u200b = zero-width space
    signature(value, false, current) + ')'
    : (value.kind === 'instance'
      ? valueNameFromId(value)
      : valueName(value));

const symbolName = s => {
  const value = head(s.value);
  return value.kind === 'instance'
    ? s.name
    : valueName(value);
};

const symbolLabel = (s, current) => {
  const value = head(s.value);
  return isFunctionKind(value.kind)
    ? symbolName(s)
    : symbolName(s);
};

const memberLabel = (s) => {
  const value = s.value ? head(s.value) : {};
  const name = isFunctionKind(value.kind) ? s.name + '()' : s.name;
  return `<span class="repr"><code>${name}</code></span>`;
};

const wrapType = (o) => {
  const { name, id } = o || {};
  return name
    ? (
      !idIsEmpty(id)
        ? `<a href="kite-atom-internal://type/${id}" class="type-value">${name}</a>`
        : `<span class="type-value">${name}</span>`
    )
    : null;
};

const unionType = (vs, map) =>
  uniq(flatten(compact(vs.map(map))).map(wrapType)).join(' | ');

const returnType = (v) =>
  v && v.length ? `-> <span class="return-type">${v}</span>` : '';

const symbolValue = s => s ? head(s.value) : {};

const symbolKind = s => symbolValue(s).kind;

const reportFromHover = hover => {
  const symbol = head(hover.symbol);
  const data = {
    symbol,
    report: hover.report,
  };
  if (data.value && data.value.id === '') { data.value.id = symbol.name; }
  return data;
};

const extractInstanceType = v => ({ name: v.type, id: v.type_id });
const extractFunctionType = v => {
  const detail = getFunctionDetails(v);
  return detail && detail.return_value
    ? detail.return_value.map(v => ({ name: v.type, id: v.type_id }))
    : [];
};

const returnTypes = v => {
  const types = extractFunctionType(v);
  return types.length
    ? `${
    types
      .slice(0, 3) //only take the first 3 for UI purposes
      .map(type => `<span class="return-type">${type.name}</span>`)
      .join('<span class="type-separator">&#8910;</span>')}`
    : null;
};

const symbolType = s =>
  symbolKind(s) === 'instance'
    //only take the first 3 for UI purposes
    ? unionType(s.value.slice(0, 3), extractInstanceType) || 'instance'
    : symbolKind(s);

const symbolTypeString = s => {
  if (symbolKind(s) === 'instance') {
    //only take the first 3 for UI purposes
    const reprs = s.value.slice(0, 3).map(v => v.repr);
    if (reprs.length > 1) {
      return '\u2772' + reprs.join(' \u22CE ') + '\u2773';
    } else {
      return reprs.join('');
    }
  }
  return symbolKind(s);
};

const completionRightLabel = s => {
  let label;
  if (symbolKind(s) === 'instance') {
    //only take the first 3 for UI purposes
    const reprs = s.value.slice(0, 3).map(v => `<span class="type">${v.repr}</span>`);
    if (reprs.length > 1) {
      label = '\u2772' + reprs.join('<span class="separator">&#8910;</span>') + '\u2773';
    } else {
      label = reprs.join('');
    }
  } else {
    label = symbolKind(s);
  }
  return `<span class="kind">${label}</span>`;
};

const kindLabel = label => `<span class="kind">${label}</span>`;

const symbolReturnType = s => unionType(s.value, extractFunctionType);

const valueType = value =>
  isFunctionKind(value.kind)
    ? returnType(unionType([value], extractFunctionType))
    : unionType([value], extractInstanceType);

const symbolId = (symbol) =>
  symbol
    ? (!idIsEmpty(symbol.id)
      ? symbol.id
      : head(symbol.value).id)
    : '';

const appendCompletionsFooter = (completion, descriptionHTML) => {
  const id = completion.symbol && completion.symbol.value &&
    completion.symbol.value[0] && completion.symbol.value[0].id;
  let actions = id
    ? `<a href="kite-atom-internal://open-search-docs/${idToDottedPath(id)}">Docs<span class="kite-link-icon">&#8663;</span></a>`
    : '';
  // Use web_id if completion is from snippets endpoint
  if (atom.config.get('kite.enableSnippets')) {
    actions = completion.web_id
      ? `<a href="kite-atom-internal://open-search-docs/${completion.web_id}">Docs<span class="kite-link-icon">&#8663;</span></a>`
      : '';
  }
  return `
  <div class="kite-completions">
    <div class="kite-completion-description">${descriptionHTML}</div>
    <div class="kite-completion-footer">
      <kite-links class="one-line" metric="Suggestion">
        ${actions}
        <div class="flex-separator"></div>
        <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
      </kite-links>
    </div>
  </div>`;
};

const parseSnippetCompletion = (editor, c, displayPrefix) => {
  const buffer = editor.getBuffer();
  const completion = {
    text: c.snippet.text,
    displayText: displayPrefix + c.display,
    className: 'kite-completion',
  };
  if (c.replace) {
    completion.replacementRange = {
      begin: buffer.positionForCharacterIndex(c.replace.begin),
      end: buffer.positionForCharacterIndex(c.replace.end),
    };
  }
  if (c.snippet.placeholders.length > 0) {
    var snippetStr = c.snippet.text;
    var offset = 0;
    for (let i = 0; i < c.snippet.placeholders.length; i++) {
      let placeholder = c.snippet.placeholders[i];
      placeholder.begin += offset;
      placeholder.end += offset;
      snippetStr = snippetStr.slice(0, placeholder.begin)
        + '${' + (i + 1).toString() + ':' + snippetStr.slice(placeholder.begin, placeholder.end)
        + '}' + snippetStr.slice(placeholder.end);
      offset += 5;
    }
    if (snippetStr) {
      // snippetStr does not contain closing parenthesis when cursor is inside function call.
      // So, add closing parenthesis, terminating tab stop, and adjust replacement range end.
      if (snippetStr[snippetStr.length - 1] !== ')') {
        snippetStr += ')$0';
        const newEnd = buffer.characterIndexForPosition(completion.replacementRange.end) + 1;
        completion.replacementRange.end = buffer.positionForCharacterIndex(newEnd);
        // snippetStr contains closing parenthesis, append terminating tab stop directly.
      } else {
        snippetStr += '$0';
      }
    }
    completion.snippet = snippetStr;
  }
  completion.type = c.hint ? c.hint : UNKNOWN_TYPE;
  completion.rightLabelHTML = kindLabel(c.hint);
  if (c.documentation.text) {
    completion.descriptionHTML = appendCompletionsFooter(c, escapeHTML(c.documentation.text));
    completion.description = c.documentation.text;
  }
  return completion;
};

module.exports = {
  appendCompletionsFooter,
  callSignature,
  completionRightLabel,
  extractFunctionType,
  idIsEmpty,
  isFunctionKind,
  kindLabel,
  memberLabel,
  parameterDefault,
  parameterName,
  parameterType,
  parameterValue,
  parseSnippetCompletion,
  reportFromHover,
  returnType,
  returnTypes,
  signature,
  symbolId,
  symbolKind,
  symbolLabel,
  symbolName,
  symbolReturnType,
  symbolType,
  symbolTypeString,
  symbolValue,
  unionType,
  valueLabel,
  valueName,
  valueNameFromId,
  valueType,
};
