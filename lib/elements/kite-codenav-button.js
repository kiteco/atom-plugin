function KiteCodenavButton(message, onClick, {
  charWidth,
  lineHeightPx,
  lineLengthPx,
}) {
  // <div class="kite-codenav-decoration">
  //    <button onclick={onClick}>
  //      {logo}
  //      <div class="text">
  //        {message}
  //      </div>
  //    </button>
  // </div>

  // Atom adds a margin style to the decoration element to place the element
  // below the current line for type: block, position: after. These
  // adjustments are relative to this starting margin, moving the
  // decoration upward and to the right.
  const div = document.createElement('div');
  div.className = 'kite-codenav-decoration';
  div.style.marginTop = `-${lineHeightPx}px`;
  div.style.marginLeft = `${lineLengthPx + 5 * charWidth}px`;

  const button = document.createElement('button');
  button.onclick = onClick;

  const logo = document.createElement('kite-logo');
  logo.className = 'inline';

  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  const text = document.createTextNode(`${message}`);

  div.appendChild(button);
  button.appendChild(logo);
  button.appendChild(textDiv);
  textDiv.appendChild(text);
  return div;
}

module.exports = KiteCodenavButton;
