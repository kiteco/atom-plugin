function obfuscate {
  printf "${1} ➞ public/${1} "
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
  printf "\e[32m✔\e[0m\n";
}

for f in lib/*.js ; do
  obfuscate $f;
done

for f in lib/**/*.js ; do
  obfuscate $f;
done
