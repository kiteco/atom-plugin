const fs = require('fs');
const path = require('path');

const privatePackagePath = path.resolve(__dirname, '..');
const privateJsonPath = path.join(privatePackagePath, 'package.json');

const publicPackagePath = path.resolve(__dirname, '../public');
const publicJsonPath = path.join(publicPackagePath, 'package.json');

const privatePackageJson = JSON.parse(String(fs.readFileSync(privateJsonPath)));
const publicPackageJson = fs.existsSync(publicJsonPath)
  ? JSON.parse(String(fs.readFileSync(publicJsonPath)))
  : {
    name: privatePackageJson.name,
    main: privatePackageJson.main,
    version: privatePackageJson.version,
    description: privatePackageJson.description,
    repository: privatePackageJson.repository,
    keywords: privatePackageJson.keywords,
    license: privatePackageJson.license
  };

publicPackageJson.engines = privatePackageJson.engines;
publicPackageJson.dependencies = privatePackageJson.dependencies;
publicPackageJson.configSchema = privatePackageJson.configSchema;
publicPackageJson.providedServices = privatePackageJson.providedServices;
publicPackageJson.consumedServices = privatePackageJson.consumedServices;

fs.writeFileSync(publicJsonPath, JSON.stringify(publicPackageJson, null, 2));
