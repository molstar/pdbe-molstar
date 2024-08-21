# Change Log
All notable changes to this project will be documented in this file, following the suggestions of [Keep a CHANGELOG](http://keepachangelog.com/). This project adheres to [Semantic Versioning](http://semver.org/) for its most widely used - and defacto - public interfaces.

## [Unreleased]

- Mol* core dependency updated to 4.5.0
  - Solves the bug with Export Models
- Use BCIF files for AlphaFold models (unless `encoding: 'cif'`)
- Added options `leftPanel`, `rightPanel`, `logPanel`, `tabs`
- Option `hideCanvasControls` accepts "trajectory" value (for multi-model structures)
- All color options accept color names and hexcodes
- `visualStyle` option allows per-component specification
- Modular UI rendering (5 top-level components renderable separately)
- Foldseek extension (PDBeMolstarPlugin.extensions.foldseek)
- StateGallery extension

## [v3.2.0] - 2024-04-24
- Mol* core dependency updated to 3.45.0
- Removed Assembly Symmetry hack (now will hide assembly symmetry section for non-biological assemblies)
- Manual testing via `portfolio.html`
- Fixed `hideStructure.nonStandard` option
- `hideStructure.het` option also hides ions
- Removed `loadCartoonsOnly` option
- Setting highlight and selection color (by `.visual.setColor()`) includes the outline color
- Web-component attributes renamed to `ligand-auth-asym-id` and `ligand-struct-asym-id` (lowercase i)
- `.visual.select()` function:
  - Improved performance
  - Allows `color: null` (do not apply color)
  - `keepColors` and `keepRepresentations` parameters to avoid clearing previous selections
- Added `.visual.tooltips` and `.visual.clearTooltips` for setting custom tooltips
- Built files don't contain package version in the filename

## [v3.1.3] - 2023-12-06
- Added ``Assembly Symmetry`` to structure controls, requires setting ``symmetryAnnotation`` in initialization parameters
- Keep sequence panel in settings even when initially hidden
- Changed `tsconfig.json` to place `tsconfig.tsbuildinfo` correctly (for incremental build)
- Fixed coloring after annotation is switched off (revert to `chain-id`, not `polymer-id`)
- Loading overlay with animated PDBe logo (requires initParam `loadingOverlay`)
- Use linting to keep code nice
- Correctly handle numeric value 0 in selections
- Fetch structures from static files when possible, instead of using ModelServer

## [v3.1.2] - 2023-08-01
- Added PDBe Sifts Mappings module to solve UniPort mappings issue
- Split Webpack config file into separate files for Production and Development

## [v3.1.1] - 2023-05-18
- Controls menu visible for AlphaFold view
- ``Reactive`` parameter addition for better responsive layout support

## [v3.1.0] - 2022-10-24
- Mol* core dependency updated to V3.15.0
- Superposition view - added option to superpose AlphaFold model
- UniPort residue numbering param addition to higlight and selection helper methods
- New param to display Sequence panel [62](https://github.com/molstar/pdbe-molstar/issues/62)

## [v1.2.1] - 2021-12-03
- Selection helper method ``representationColor`` param issue fix

## [v1.2.0] - 2021-09-20
- Add parameters to support AlphaFold Protein Structure DB view
- Add parameters to customize mouse events, issues [#8](https://github.com/PDBeurope/pdbe-molstar/issues/8) 
- Add parameter to customize ``lighting`` setting
- Extend ``Selection / highlight`` helper methods to support ``label_atom_id`` list, issues [#32](https://github.com/PDBeurope/pdbe-molstar/issues/32)
- Extend helper methods support for multiple structures
- Extend ``hideCanvasControls``
- Fix Frame rate drop issue while rotating the canvas
- Fix RGB color issue for params starting with r:0