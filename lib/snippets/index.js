/* 
 * Used to patch snippet.insert to not add additional whitespace in front of multiline completions.
 * Taken from atom/snippets at https://github.com/atom/snippets
 */

module.exports = {
  Snippet: require('./snippet'),
  SnippetExpansion: require('./snippet-expansion'),
}
