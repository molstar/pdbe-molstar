var gulp = require('gulp');
const fs = require('fs');
const path = require('path');
var del = require('del');
var concat = require('gulp-concat');
var header = require('gulp-header');

const PACKAGE_ROOT_PATH = process.cwd();
const PACKAGE = require(path.join(PACKAGE_ROOT_PATH, 'package.json'));

const banner = [
    '/**',
    ` * ${PACKAGE.name}`,
    ` * @version ${PACKAGE.version}`,
    ' * @link https://github.com/PDBeurope/pdbe-molstar',
    ' * @license Apache 2.0',
    ' */',
    '',
].join('\n');

const license = [
    '/**',
    ' * Copyright 2019-2020 Mandar Deshpande <mandar@ebi.ac.uk>',
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
    '',
].join('\n');

// Remove any files produced by the build process
gulp.task('clean-all', function () {
    return del(['lib', 'build', 'tsconfig.tsbuildinfo']);
});

// Remove built web component
gulp.task('clean-component', function () {
    return del([`build/${PACKAGE.name}-component-${PACKAGE.version}.js`]);
});

gulp.task('concat', function () {
    return gulp
        .src([
            `build/${PACKAGE.name}-plugin-${PACKAGE.version}.js`,
            `lib/${PACKAGE.name}-component-build-${PACKAGE.version}.js`,
        ])
        .pipe(concat(`${PACKAGE.name}-component-${PACKAGE.version}.js`))
        .pipe(header(license, {}))
        .pipe(header(banner, {}))
        .pipe(gulp.dest('build/'));
});

// Build web component
gulp.task('bundle-webcomponent', gulp.series('clean-component', 'concat'));

function replaceSkin(srcFile, skin, destFile) {
    let text = fs.readFileSync(srcFile, { encoding: 'utf8' });
    text = text.replaceAll('mol-plugin-ui/skin/dark.scss', `mol-plugin-ui/skin/${skin}.scss`);
    fs.writeFileSync(destFile, text, { encoding: 'utf8' });
}

// Prepare module files for light skin
gulp.task('light-skin', async function () {
    replaceSkin('lib/index.js', 'light', 'lib/index(light).js');
    replaceSkin('lib/index.d.ts', 'light', 'lib/index(light).d.ts');
});

// Remove unnecessary files produced by the build process
gulp.task('clean-rubbish', function () {
    return del([`build/${PACKAGE.name}-light-plugin-${PACKAGE.version}.*`]);
});
