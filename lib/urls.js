'use strict';
const md5 = require('md5');
const { Point, Range } = require('atom');
const { head } = require('./utils');

function tokensPath(editor) {
  const state = md5(editor.getText());
  const filename = editor.getPath();
  const buffer = cleanPath(filename);
  return `/api/buffer/atom/${buffer}/${state}/tokens`;
}

function languagesPath() {
  return '/clientapi/languages';
}

function metricsCounterPath() {
  return '/clientapi/metrics/counters';
}

function accountPath() {
  return '/api/account/user';
}

function signaturePath() {
  return '/clientapi/editor/signatures';
}

function authorizedPath(editor) {
  return `/clientapi/permissions/authorized?filename=${encodeURI(editor.getPath())}`;
}

function searchPath(query, offset = 0, limit = 10) {
  return [
    '/api/editor/search',
    [
      `q=${encodeURI(query)}`,
      `offset=${offset}`,
      `limit=${limit}`,
    ].join('&'),
  ].join('?');
}

function projectDirPath(path) {
  return [
    '/clientapi/projectdir',
    `filename=${encodeURI(path)}`,
  ].join('?');
}

function shouldNotifyPath(path) {
  return [
    '/clientapi/permissions/notify',
    `filename=${encodeURI(path)}`,
  ].join('?');
}

function statusPath(path) {
  return [
    '/clientapi/status',
    `filename=${encodeURI(path)}`,
  ].join('?');
}

function reportPath(data) {
  const value = head(head(data.symbol).value);

  return valueReportPath(value.id);
}

function valueReportPath(id) {
  return `/api/editor/value/${id}`;
}

function symbolReportPath(id) {
  return `/api/editor/symbol/${id}`;
}

function membersPath(id, page = 0, limit = 999) {
  return [
    `/api/editor/value/${id}/members`,
    [
      `offset=${page}`,
      `limit=${limit}`,
    ].join('&'),
  ].join('?');
}

function usagesPath(id, page = 0, limit = 999) {
  return [
    `/api/editor/value/${id}/usages`,
    [
      `offset=${page}`,
      `limit=${limit}`,
    ].join('&'),
  ].join('?');
}

function usagePath(id) {
  return `/api/editor/usages/${id}`;
}

function examplePath(id) {
  return `/api/python/curation/${id}`;
}

function openExampleInWebURL(id) {
  return `http://localhost:46624/clientapi/desktoplogin?d=/examples/python/${escapeId(id)}`;
}

function hoverPath(editor, range) {
  range = Range.fromObject(range);

  const state = md5(editor.getText());
  const filename = editor.getPath();
  const buffer = cleanPath(filename);
  const start = editor.getBuffer().characterIndexForPosition(range.start);
  const end = editor.getBuffer().characterIndexForPosition(range.end);
  return [
    `/api/buffer/atom/${buffer}/${state}/hover`,
    [
      `selection_begin_runes=${start}`,
      `selection_end_runes=${end}`,
    ].join('&'),
  ].join('?');
}

function hoverPositionPath(editor, position) {
  position = Point.fromObject(position);

  const state = md5(editor.getText());
  const filename = editor.getPath();
  const buffer = cleanPath(filename);
  const pos = editor.getBuffer().characterIndexForPosition(position);
  return [
    `/api/buffer/atom/${buffer}/${state}/hover`,
    `cursor_runes=${pos}`,
  ].join('?');
}

function escapeId(id) {
  return encodeURI(String(id)).replace(/;/g, '%3B');
}

function cleanPath(p) {
  return encodeURI(p)
    .replace(/^([A-Z]):/, '/windows/$1')
    .replace(/\/|\\|%5C/g, ':');
}

function internalURL(path) {
  return `kite-atom-internal://${path}`;
}

function internalGotoURL(def) {
  return internalURL(`goto/${encodeURI(def.filename)}:${def.line}`);
}

function internalGotoIdURL(id) {
  return internalURL(`goto-id/${id}`);
}

function internalExpandURL(id) {
  return internalURL(`expand/${id}`);
}

function internalGotoRangeURL(range) {
  return internalURL(`goto-range/${serializeRangeForPath(range)}`);
}

function internalOpenRangeInWebURL(range) {
  return internalURL(`open-range/${serializeRangeForPath(range)}`);
}

function internalExpandPositionURL(position) {
  return internalURL(`expand-position/${serializePositionForPath(position)}`);
}

function internalGotoPositionURL(position) {
  return internalURL(`goto-position/${serializePositionForPath(position)}`);
}

function internalOpenPositionInWebURL(position) {
  return internalURL(`open-position/${serializePositionForPath(position)}`);
}

function serializeRangeForPath(range) {
  return `${serializePositionForPath(range.start)}/${serializePositionForPath(range.end)}`;
}
function serializePositionForPath(position) {
  return `${position.row}:${position.column}`;
}

module.exports = {
  accountPath,
  authorizedPath,
  examplePath,
  hoverPath,
  hoverPositionPath,
  internalExpandPositionURL,
  internalExpandURL,
  internalGotoIdURL,
  internalGotoPositionURL,
  internalGotoRangeURL,
  internalGotoURL,
  internalOpenPositionInWebURL,
  internalOpenRangeInWebURL,
  internalURL,
  languagesPath,
  membersPath,
  metricsCounterPath,
  openExampleInWebURL,
  projectDirPath,
  reportPath,
  searchPath,
  serializeRangeForPath,
  shouldNotifyPath,
  signaturePath,
  statusPath,
  symbolReportPath,
  tokensPath,
  usagePath,
  usagesPath,
  valueReportPath,
};
