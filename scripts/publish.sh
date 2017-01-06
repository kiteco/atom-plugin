npm run copy &&
npm run obfuscate &&
npm run package:public &&
npm run commit:public &&
eval "apm publish $1" &&
npm run commit:private;
