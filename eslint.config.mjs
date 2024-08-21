import eslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import stylisticEslint from '@stylistic/eslint-plugin';


export default tsEslint.config(
    eslint.configs.recommended,
    ...tsEslint.configs.recommended,
    ...tsEslint.configs.stylistic,
    {
        plugins: {
            '@stylistic': stylisticEslint,
        },
        rules: {
            // RELAX RECOMMENDED RULES
            'prefer-const': [
                'error',
                {
                    destructuring: 'all', // Allow `let` when at least one destructured element will be changed
                },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/consistent-indexed-object-style': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',

            // ADDITIONAL RULES - GENERAL
            'eqeqeq': 'error', // Forbid using `==`, enforce `===`
            'no-eval': 'error', // Forbid using `eval`
            'no-new-wrappers': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'ExportDefaultDeclaration',
                    message: 'Default exports are not allowed',
                },
            ],
            'no-var': 'error', // Forbid using `var`
            'no-void': 'error', // Forbid using `void 0`, use `undefined` instead
            'no-throw-literal': 'error', // Forbid throwing anything that's not Error, e.g. `throw 'Blabla'`
            '@typescript-eslint/prefer-namespace-keyword': 'error', // Forbid `module` keyword

            // ADDITIONAL RULES - @stylistic
            '@stylistic/indent': ['error', 4],
            '@stylistic/semi': 'error', // Enforce trailing semicolons, including after type definitions
            '@stylistic/comma-dangle': ['error', { // Enforce comma after last listed item when closing ] or } is on the next line
                arrays: 'always-multiline',
                objects: 'always-multiline',
                imports: 'always-multiline',
                exports: 'always-multiline',
                enums: 'always-multiline',
                tuples: 'always-multiline',
                functions: 'only-multiline', // This would look ugly after JSX syntax in `map`
            }],
            '@stylistic/eol-last': 'error', // Enforce newline at the end of file
            '@stylistic/quotes': [
                'error',
                'single',
                {
                    // Enforce single quotes: 'hello'
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                },
            ],
            '@stylistic/brace-style': [
                'error',
                '1tbs',
                {
                    // Enforce line break after { and before }
                    allowSingleLine: true,
                },
            ],
            '@stylistic/member-delimiter-style': [
                'error',
                {
                    // Enforce commas in interfaces and types
                    multiline: {
                        delimiter: 'comma',
                        requireLast: true,
                    },
                    singleline: {
                        delimiter: 'comma',
                        requireLast: false,
                    },
                    multilineDetection: 'brackets',
                },
            ],

            // ADDITIONAL RULES - @stylistic - SPACING
            '@stylistic/array-bracket-spacing': 'error', // Forbid spaces in array: [_1, 2_]
            '@stylistic/arrow-spacing': 'error', // Enforce space in lambda function: x_=>_x**2
            '@stylistic/block-spacing': 'error', // Enforce space in one-line block: () => {_return true;_}
            '@stylistic/comma-spacing': 'error', // Enforce space after comma: [1,_2,_3]
            '@stylistic/computed-property-spacing': 'error', // Forbid spaces in indexing: a[_0_]
            '@stylistic/function-call-spacing': 'error', // Forbid space when calling function: f_(0)
            '@stylistic/key-spacing': 'error', // Enforce space after colon in object: { a:_1, b:_2 }
            '@stylistic/keyword-spacing': 'error', // Enforce space after `if`, `try`, etc.: if_(true)
            '@stylistic/no-multi-spaces': 'error', // Forbid more than one space: x =__5
            '@stylistic/no-trailing-spaces': 'error', // No spaces at the end of line: foo()_
            '@stylistic/object-curly-spacing': ['error', 'always'], // Enforce spaces in object: {_a: 1, b: 2_}
            '@stylistic/semi-spacing': 'error', // Enforce space after semicolon: for (let i = 0;_i < n;_i++)
            '@stylistic/space-before-blocks': 'error', // Enforce space before block: if (true)_{}
            '@stylistic/space-before-function-paren': [
                'error',
                {
                    anonymous: 'always', // function_() {}
                    named: 'never', // function foo_() {}
                    asyncArrow: 'always', // async_() {}
                },
            ],
            '@stylistic/space-in-parens': 'error', // Forbid spaces in parentheses: (_1, 2_)
            '@stylistic/space-infix-ops': 'error', // Enforce space around infix operators: 1_+_2
            '@stylistic/spaced-comment': [
                'error',
                'always',
                {
                    // Enforce space in comment: /**_Comment_*/ //_comment
                    block: {
                        balanced: true,
                    },
                },
            ],
            '@stylistic/type-annotation-spacing': 'error', // Enforce space after type annotation colon: let x:_string;
        },
    },
);
