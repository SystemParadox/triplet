var assert = require('chai').assert;
var parse = require('../').parse;
var fs = require('fs');

function test(input, expected) {
    if (arguments.length < 2) {
        expected = input;
    }
    var output = parse(input);
    assert.deepEqual(output, expected);
}

describe('parser', function () {
    it('should parse arbitrary program text', function () {
        test('hello', [
            {
                type: 'Chunk',
                raw: 'hello',
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse strings', function () {
        test('"foo"', [
            {
                type: 'StringLiteral',
                quote: '"',
                triple: false,
                value: 'foo',
                lineNumber: 1,
                lineStart: 0,
                range: [0, 5],
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse regular expressions', function () {
        test('/foo/', [
            {
                type: 'RegexLiteral',
                value: /foo/,
                literal: '/foo/',
                range: [0, 5],
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse line comments', function () {
        test('// foo', [
            {
                leadingComments: '// foo',
                type: 'EOF',
            }
        ]);
    });

    it('should parse block comments', function () {
        test('/* foo */', [
            {
                leadingComments: '/* foo */',
                type: 'EOF',
            }
        ]);
    });

    it('should parse blocks in curly braces', function () {
        test('{foo}', [
            {
                type: 'Block',
                startCh: '{',
                endCh: '}',
                body: [
                    {
                        type: 'Chunk',
                        raw: 'foo',
                    },
                ],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse blocks in round brackets', function () {
        test('(foo)', [
            {
                type: 'Block',
                startCh: '(',
                endCh: ')',
                body: [
                    {
                        type: 'Chunk',
                        raw: 'foo',
                    },
                ],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse empty brackets', function () {
        test('foo () bar', [
            {
                type: 'Chunk',
                raw: 'foo',
            },
            {
                leadingComments: ' ',
                body: [],
                type: 'Block',
                startCh: '(',
                endCh: ')',
            },
            {
                leadingComments: ' ',
                type: 'Chunk',
                raw: 'bar',
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse blocks in square brackets', function () {
        test('[foo]', [
            {
                type: 'Block',
                startCh: '[',
                endCh: ']',
                body: [
                    {
                        type: 'Chunk',
                        raw: 'foo',
                    },
                ],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse nested brackets', function () {
        test('{(foo["bar"])}', [
            {
                type: 'Block',
                startCh: '{',
                endCh: '}',
                body: [
                    {
                        type: 'Block',
                        startCh: '(',
                        endCh: ')',
                        body: [
                            {
                                type: 'Chunk',
                                raw: 'foo',
                            },
                            {
                                type: 'Block',
                                startCh: '[',
                                endCh: ']',
                                body: [
                                    {
                                        type: 'StringLiteral',
                                        quote: '"',
                                        triple: false,
                                        value: 'bar',
                                        lineNumber: 1,
                                        lineStart: 0,
                                        range: [6, 11],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse triple strings', function () {
        test('"""foo"""', [
            {
                type: 'StringLiteral',
                quote: '"',
                triple: true,
                value: 'foo',
                lineNumber: 1,
                lineStart: 0,
                range: [0, 9],
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse "a / b" as divide', function () {
        test('a / b', [
            {
                type: 'Chunk',
                raw: 'a',
            },
            {
                type: 'Chunk',
                raw: '/',
                leadingComments: ' ',
            },
            {
                type: 'Chunk',
                raw: 'b',
                leadingComments: ' ',
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse "x = /a/g" as regex', function () {
        test('x = /a/g', [
            {
                type: 'Chunk',
                raw: 'x',
            },
            {
                type: 'Chunk',
                raw: '=',
                leadingComments: ' ',
            },
            {
                type: 'RegexLiteral',
                literal: '/a/g',
                value: /a/g,
                range: [4, 8],
                leadingComments: ' ',
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse "x = (/a/g)" as regex', function () {
        test('x = (/a/g)', [
            {
                type: 'Chunk',
                raw: 'x',
            },
            {
                leadingComments: ' ',
                type: 'Chunk',
                raw: '=',
            },
            {
                leadingComments: ' ',
                type: 'Block',
                startCh: '(',
                endCh: ')',
                body: [
                    {
                        type: 'RegexLiteral',
                        literal: '/a/g',
                        value: /a/g,
                        range: [5, 9],
                    },
                ]
            },
            {
                type: 'EOF',
            },
        ]);
    });

    it('should parse the return keyword', function () {
        test('return', [
            {
                type: 'Keyword',
                value: 'return',
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse "return /foo/" as regex', function () {
        test('return /foo/', [
            {
                type: 'Keyword',
                value: 'return',
            },
            {
                leadingComments: ' ',
                type: 'RegexLiteral',
                literal: '/foo/',
                value: /foo/,
                range: [7, 12],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse "throw /foo/" as regex', function () {
        test('throw /foo/', [
            {
                type: 'Keyword',
                value: 'throw',
            },
            {
                leadingComments: ' ',
                type: 'RegexLiteral',
                literal: '/foo/',
                value: /foo/,
                range: [6, 11],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse the if keyword', function () {
        test('if', [
            {
                type: 'Keyword',
                value: 'if',
            },
            {
                type: 'EOF',
            }
        ]);
        test('foo if bar', [
            {
                type: 'Chunk',
                raw: 'foo',
            },
            {
                leadingComments: ' ',
                type: 'Keyword',
                value: 'if',
            },
            {
                leadingComments: ' ',
                type: 'Chunk',
                raw: 'bar',
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse "if () /foo/" as regex', function () {
        test('if () /foo/', [
            {
                type: 'Keyword',
                value: 'if',
            },
            {
                leadingComments: ' ',
                body: [],
                type: 'Block',
                startCh: '(',
                endCh: ')',
            },
            {
                leadingComments: ' ',
                type: 'RegexLiteral',
                literal: '/foo/',
                value: /foo/,
                range: [6, 11],
            },
            {
                type: 'EOF',
            }
        ]);
    });

    it('should parse multiple chunks', function () {
        test('foo "bar" baz', [
            {
                type: 'Chunk',
                raw: 'foo',
            },
            {
                leadingComments: ' ',
                type: 'StringLiteral',
                quote: '"',
                triple: false,
                value: 'bar',
                lineNumber: 1,
                lineStart: 0,
                range: [4, 9],
            },
            {
                leadingComments: ' ',
                type: 'Chunk',
                raw: 'baz',
            },
            {
                type: 'EOF',
            },
        ]);
    });
});
