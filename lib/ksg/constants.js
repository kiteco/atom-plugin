'use strict';

const CODEBLOCKS_CLICKED = 'did-codeblocks-get-clicked';
const SEARCH_CLICKED = 'did-search-get-clicked';

const CODEBLOCKS_ADD = 'did-codeblocks-add-all';
const CODEBLOCK_CLICKED = 'did-codeblock-get-clicked';
const CODEBLOCKS_SELECTED = 'did-codeblocks-get-selected';
const CODEBLOCKS_SELECTION_EVENT = 'did-codeblocks-selection-event';

const SEARCH_QUERY_EVENT = 'did-search-query-event';

const SEARCH_QUERY_SELECTION_EVENT = 'did-search-query-selected-event';

const CODEBLOCKS_EVENT = 'did-codeblocks-event';
const SEARCH_EVENT = 'did-search-event';

const CODEBLOCKS_MODEL_UPDATE = 'did-codeblocks-model-update';
const SEARCH_MODEL_UPDATE = 'did-search-model-update';

const SEARCH_DEBOUNCE = 200; //ms

const SEARCH_NAV_UP = -1;
const SEARCH_NAV_DOWN = 1;

module.exports = {
  CODEBLOCKS_CLICKED,
  CODEBLOCKS_ADD,
  CODEBLOCK_CLICKED,
  CODEBLOCKS_SELECTED,
  CODEBLOCKS_SELECTION_EVENT,
  SEARCH_CLICKED,
  SEARCH_QUERY_EVENT,
  SEARCH_QUERY_SELECTION_EVENT,
  CODEBLOCKS_EVENT,
  SEARCH_EVENT,
  CODEBLOCKS_MODEL_UPDATE,
  SEARCH_MODEL_UPDATE,
  SEARCH_DEBOUNCE,
  SEARCH_NAV_DOWN,
  SEARCH_NAV_UP,
};