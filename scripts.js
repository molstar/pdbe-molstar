const fs = require('fs');
const path = require('path');
var argparse = require('argparse');

const PACKAGE_ROOT_PATH = process.cwd();
const PACKAGE = require(path.join(PACKAGE_ROOT_PATH, 'package.json'));

const banner = [
    '/**',
    ` * ${PACKAGE.name}`,
    ` * @version ${PACKAGE.version}`,
    ' * @link https://github.com/PDBeurope/pdbe-molstar',
    ' * @license Apache 2.0',
    ' */',
].join('\n');

const license = [
    '/**',
    ' * Copyright 2019-2023 Mandar Deshpande <mandar@ebi.ac.uk>, Adam Midlik <midlik@ebi.ac.uk>',
    ' * European Bioinformatics Institute (EBI, http://www.ebi.ac.uk/)',
    ' * European Molecular Biology Laboratory (EMBL, http://www.embl.de/)',
    ' * Licensed under the Apache License, Version 2.0 (the "License");',
    ' * you may not use this file except in compliance with the License.',
    ' * You may obtain a copy of the License at ',
    ' * http://www.apache.org/licenses/LICENSE-2.0',
    ' * ',
    ' * Unless required by applicable law or agreed to in writing, software',
    ' * distributed under the License is distributed on an "AS IS" BASIS, ',
    ' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
    ' * See the License for the specific language governing permissions and ',
    ' * limitations under the License.',
    ' */',
].join('\n');

function removeFiles(...paths) {
    for (const path of paths) {
        fs.rmSync(path, { recursive: true, force: true });
    }
}

function replaceSkin(srcFile, skin, destFile) {
    let text = fs.readFileSync(srcFile, { encoding: 'utf8' });
    text = text.replaceAll('mol-plugin-ui/skin/dark.scss', `mol-plugin-ui/skin/${skin}.scss`);
    fs.writeFileSync(destFile, text, { encoding: 'utf8' });
}

const scripts = {
    /** Remove any files produced by the build process */
    'clean-all': () => {
        removeFiles('lib', 'build', 'tsconfig.tsbuildinfo');
    },

    /** Build web component */
    'bundle-webcomponent': () => {
        const outputFile = `build/${PACKAGE.name}-component-${PACKAGE.version}.js`;
        removeFiles(outputFile);
        const contents = [
            banner,
            license,
            fs.readFileSync(`build/${PACKAGE.name}-plugin-${PACKAGE.version}.js`),
            fs.readFileSync(`lib/${PACKAGE.name}-component-build-${PACKAGE.version}.js`),
        ];
        fs.writeFileSync(outputFile, contents.join('\n\n'), { encoding: 'utf8' });
    },

    /** Prepare module files for light skin */
    'light-skin': () => {
        replaceSkin('lib/index.js', 'light', 'lib/index(light).js');
        replaceSkin('lib/index.d.ts', 'light', 'lib/index(light).d.ts');
    },

    /** Remove unnecessary files produced by the build process */
    'clean-rubbish': () => {
        removeFiles(
            `build/${PACKAGE.name}-light-plugin-${PACKAGE.version}.js`,
            `build/${PACKAGE.name}-light-plugin-${PACKAGE.version}.js.LICENSE.txt`
        );
    },
};

// scripts['clean-rubbish']();

// console.log(process.argv)

const parser = new argparse.ArgumentParser({ description: '' });
parser.add_argument('script_name', { choices: Object.keys(scripts) });
const args = parser.parse_args();

console.log('Running script', args.script_name);

scripts[args.script_name]();
