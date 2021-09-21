var gulp = require('gulp');
const path = require('path');
var del = require('del');
var concat = require('gulp-concat');
var header = require('gulp-header');

const PACKAGE_ROOT_PATH = process.cwd();
const PKG_JSON = require(path.join(PACKAGE_ROOT_PATH, "package.json"));

const banner = ['/**',
  ` * ${PKG_JSON.name}`,
  ` * @version ${PKG_JSON.version}`,
  ' * @link https://github.com/PDBeurope/pdbe-molstar',
  ' * @license Apache 2.0',
  ' */',
  ''].join('\n');

  const license = ['/**',
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
  ''].join('\n');


gulp.task('clean', function() {
    return del([`build/${PKG_JSON.name}-component-${PKG_JSON.version}.js`, '!build']);
});

gulp.task('concat', function () {
    return gulp.src([`build/${PKG_JSON.name}-plugin-${PKG_JSON.version}.js`,`lib/${PKG_JSON.name}-component-build-${PKG_JSON.version}.js`])
        .pipe(concat(`${PKG_JSON.name}-component-${PKG_JSON.version}.js`))
        .pipe(header(license, {} ))
		.pipe(header(banner, {} ))
        .pipe(gulp.dest('build/'));
});

gulp.task('default', gulp.series('clean', 'concat'));