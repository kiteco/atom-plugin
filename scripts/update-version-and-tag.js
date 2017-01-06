const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

const privatePackagePath = path.resolve(__dirname, '..');
const privateJsonPath = path.join(privatePackagePath, 'package.json');

const publicPackagePath = path.resolve(__dirname, '../public');
const publicJsonPath = path.join(publicPackagePath, 'package.json');

const privatePackageJson = JSON.parse(String(fs.readFileSync(privateJsonPath)));
const publicPackageJson = JSON.parse(String(fs.readFileSync(publicJsonPath)))

privatePackageJson.version = publicPackageJson.version;

fs.writeFileSync(privateJsonPath, JSON.stringify(privatePackageJson, null, 2));

console.log(String(execSync(`git commit -am ":package: v${privatePackageJson.version}"`)));
console.log(String(execSync(`git tag v${privatePackageJson.version}`)));
