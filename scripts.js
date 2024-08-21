const fs = require('fs');
const path = require('path');
const argparse = require('argparse');

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

function addBanner(file) {
    if (!fs.existsSync(file)) return;
    const contents = [
        banner,
        fs.readFileSync(file, { encoding: 'utf8' }),
    ];
    fs.writeFileSync(file, contents.join('\n\n'), { encoding: 'utf8' });
}

const scripts = {
    /** Remove any files produced by the build process */
    'clean-all': () => {
        removeFiles('lib', 'build', 'tsconfig.tsbuildinfo');
    },

    /** Remove unnecessary files produced by the build process */
    'clean-rubbish': () => {
        removeFiles(`build/${PACKAGE.name}-light-plugin.js`);
    },

    /** Build web component */
    'bundle-webcomponent': () => {
        const outputFile = `build/${PACKAGE.name}-component.js`;
        removeFiles(outputFile);
        const contents = [
            license,
            fs.readFileSync(`build/${PACKAGE.name}-plugin.js`, { encoding: 'utf8' }),
            fs.readFileSync(`lib/${PACKAGE.name}-component-build.js`, { encoding: 'utf8' }),
        ];
        fs.writeFileSync(outputFile, contents.join('\n\n'), { encoding: 'utf8' });
    },

    /** Add a banner with version info to the built files */
    'add-banners': () => {
        addBanner(`build/${PACKAGE.name}-plugin.js`);
        addBanner(`build/${PACKAGE.name}-plugin.js.LICENSE.txt`);
        addBanner(`build/${PACKAGE.name}-component.js`);
        addBanner(`build/${PACKAGE.name}.css`);
        addBanner(`build/${PACKAGE.name}-light.css`);
    },
};


const parser = new argparse.ArgumentParser({ description: '' });
parser.add_argument('script_name', { choices: Object.keys(scripts) });
const args = parser.parse_args();

console.log('Running script', args.script_name);

scripts[args.script_name]();
