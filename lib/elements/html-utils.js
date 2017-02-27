const path = require('path');
const {head} = require('../utils');
const {
  symbolLabel, symbolType,
  valueLabel, valueType,
  memberLabel, parameterName, parameterType,
} = require('../kite-data-utils');

function stripBody(html) {
  return (html || '').replace(/<body>/, '').replace(/<\/body>/, '');
}

function valueDescription(data) {
  const {value} = data;

  return data.report &&
         data.report.description_html &&
         data.report.description_html !== ''
    ? stripBody(data.report.description_html)
    : value.synopsis;
}

function symbolDescription(data) {
  const symbol = head(data.symbol);
  const value = head(symbol.value);

  return data.report &&
         data.report.description_html &&
         data.report.description_html !== ''
    ? stripBody(data.report.description_html)
    : (value.synopsis != '' ? value.synopsis : symbol.synopsis);
}

function renderSymbolHeader(symbol) {
  return renderHeader(symbolLabel(symbol), symbolType(symbol));
}

function renderValueHeader(symbol) {
  return renderHeader(valueLabel(symbol), valueType(symbol));
}

function renderHeader(name, type) {
  return `
  <div class="expand-header split-line">
    <span class="name">${name}</span>
    <span class="type">${type}</span>
  </div>`;
}

function parameterize(string) {
  return string.toLowerCase().replace(/\s+/g, '-');
}

function section(title, content) {
  return `<section class="${parameterize(title)}">
    <h4>${title}</h4>
    <div class="section-content">
      ${content}
    </div>
  </section>`;
}

function renderExtend(symbol) {
  return '';
  // return !symbol.bases || symbol.bases.length === 0
  //   ? ''
  //   : `
  //   <div class="expand-extend split-line">
  //     <span class="name">
  //       <a href="kite-atom-internal://base/method">BaseCounter.increment(n)</a>
  //     </span>
  //     <span class="type"><a href="kite-atom-internal://base/return">-> int</a></span>
  //   </div>`;
}

function renderDefinition(value) {
  const def = value.report && value.report.definition;
  if (def) {
    const url = `kite-atom-internal://goto/${stripLeadingSlash(def.filename)}:${def.line}`;

    return section('Definition', `
    <ul>
      <li>
        <i class="icon icon-file-code"></i>
        <span class="file">${path.basename(def.filename)}:${def.line}</span>
        <a href="${url}">Go to <i class="icon icon-chevron-right"></i></a>
        </li>
    </ul>`);
  } else {
    return '';
  }
}

function renderExamples(data, limit = 2) {
  return data.report && data.report.examples && data.report.examples.length
    ? section('Examples', `
      <ul>${data.report.examples.slice(0, limit).map(renderExample).join('')}</ul>
      ${additionalExamplesLink(data.report.examples.length - 2, data)}
    `)
    : '';
}

function renderExample(example) {
  return `<li data-name="${example.title}">
    <i class="icon icon-code"></i>
    <a href="kite-atom-internal://example/${example.id}" class="example">
      <span class="title">${example.title}</span>
      <i class="icon icon-chevron-right"></i>
    </a>
  </li>`;
}

function additionalExamplesLink(examplesCount, data) {
  return examplesCount <= 0
    ? ''
    : `<a href="kite-atom-internal://examples-list/${data.value.id}"
          class="more-examples">See ${examplesCount} more examples</a>`;
}

function renderUsages(symbol) {
  return symbol.report && symbol.report.usages && symbol.report.usages.length
    ? section('Usages', `
      <ul class="usages-box">
        ${symbol.report.usages.map(renderUsage).join('')}
      </ul>`)
    : '';
}

function renderUsage(usage) {
  const base = path.basename(usage.filename);
  const url = [
    `kite-atom-internal://goto/${stripLeadingSlash(usage.filename)}`,
    usage.line,
    usage.begin_runes,
  ].join(':');

  return `<li class="usage">
    <pre><code>${usage.code}</code></pre>
    <div class="links">
      <a href="${url}">${base}:${usage.line}</a> <a class="web-link">Web</a>
    </div>
  </li>`;
}

function renderMembers(value, limit) {
  const {members, total_members} = value.detail;

  return members.length === 0
    ? ''
    : (limit != null
      ? section('Top members', `
        <ul>
          ${members.slice(0, 2).map(m => renderMember(m)).join('')}
        </ul>
        ${additionalMembersLink(total_members - 2, value)}`)
      : section('Top members', `
        <ul>
          ${members.map(m => renderMember(m)).join('')}
        </ul>`));
}

function stripLeadingSlash(str) {
  return str.replace(/^\//, '');
}

function renderMember(member) {
  const label = member.id && member.id !== ''
    ? `<a href="kite-atom-internal://member/${member.id}">${memberLabel(member)}</a>`
    : memberLabel(member);

  const type = head(member.value).kind;
  const synopsis = head(member.value).synopsis;

  const description = synopsis ? `<p>${synopsis}</p>` : '';

  return `<li data-name="${member.name}">
    <div class="split-line">
      <span class="name">${label}</span>
      <span class="type">${type}</span>
    </div>
    ${description}
  </li>`;
}

function additionalMembersLink(membersCount, value) {
  return membersCount <= 0
    ? ''
    : `<a href="kite-atom-internal://members-list/${value.id}"
          class="more-members">See ${membersCount} more members</a>`;
}

function renderParameters(value) {
  const {detail} = value;

  return detail &&
         (
          (detail.parameters && detail.parameters.length) ||
          detail.vararg ||
          detail.kwarg
         )
    ? section('Parameters', `
    <dl>
      ${detail.parameters.map(p => renderParameter(p)).join('')}
      ${renderParameter(detail.vararg, '*')}
      ${renderParameter(detail.kwarg, '**')}
    </dl>`)
    : '';
}

function renderParameter(param, prefix = '') {
  return !param
    ? ''
    : `<dt class="split-line">
      <span class="name">${parameterName(param, prefix)}</span>
      <span class="type">${parameterType(param)}</span>
    </dt>
    <dd>${param.synopsis}</dd>
    `;
}

function renderInvocations(symbol) {
  return '';
//   return section('Invocations', `<pre><code>Counter.increment(10)
// Counter.increment(10, foo='bar')</code></pre>`);
}

module.exports = {
  renderDefinition,
  renderExample,
  renderExamples,
  renderExtend,
  renderInvocations,
  renderMember,
  renderMembers,
  renderParameter,
  renderParameters,
  renderSymbolHeader,
  renderUsages,
  renderValueHeader,
  section,
  symbolDescription,
  valueDescription,
};
