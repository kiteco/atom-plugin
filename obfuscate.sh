cp package.json public/package.json;
cp -R styles public/styles;
cp -R keymaps public/keymaps;
cp -R assets public/assets;

function obfuscate {
  echo "obfuscate ${1} to public/${1}"
  if [[ "$1" = */* ]]; then
    mkdir -p "public/${1%/*}";
  fi;
  touch public/${1};

  javascript-obfuscator $1 \
                        -o public/${1} \
                        --compact false \
                        --stringArray false \
                        --disableConsoleOutput false \
                        --reservedNames activate,deactivate,completions,consumeStatusBar;
}

for f in lib/*.js ; do
  obfuscate $f;
done

for f in lib/**/*.js ; do
  obfuscate $f;
done
