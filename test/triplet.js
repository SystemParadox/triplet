var assert = require('chai').assert;
var triplet = require('../');
var fs = require('fs');
var es = require('event-stream');

function test(input, expected, options) {
    if (arguments.length < 2) {
        expected = input;
    }
    options = options || {};
    options.jsx = true;
    var output = triplet(input, options);
    expectedLines = expected.split('\n');
    outputLines = output.split('\n');
    //console.error('INN:', JSON.stringify(input));
    //console.error('OUT:', JSON.stringify(output));
    //console.error('EXP:', JSON.stringify(expected));
    expectedLines.forEach(function (line, i) {
        assert.equal(outputLines[i], line, 'line ' + (i + 1));
    });
    assert.equal(outputLines.length, expectedLines.length, 'line count');
}

function error(input, expected) {
    var options = {
        jsx: true,
    };
    var err = null;
    try {
        triplet(input, options);
    } catch (e) {
        err = e;
    }
    assert(err, 'Expected error');
    //console.error('INN:', JSON.stringify(input));
    //console.error('OUT:', JSON.stringify(err.stack));
    //console.error('EXP:', JSON.stringify(expected));
    assert.equal(err.message, expected);
}

describe('triplet', function () {
    it('should return the original content', function () {
        test('hello');
    });

    it('should return existing strings unmodified', function () {
        test('"hello"');
        test("'hello'");
    });

    it('should replace triple-quoted strings', function () {
        test('"""hello"""', '"hello"');
    });

    it('should parse empty triple-quoted strings', function () {
        test('""""""', '""');
        test("''''''", "''");
    });

    it('should use the same quote characters', function () {
        test('"""hello"""', '"hello"');
        test("'''hello'''", "'hello'");
    });

    it('should escape nested quote characters', function () {
        test('"""one "two" three"""', '"one \\"two\\" three"');
    });

    it('should preserve line numbering', function () {
        var input = 'query("""\nhello\nworld\n""");';
        var output = triplet(input);
        assert.equal(input.split('\n').length, output.split('\n').length);
    });

    it('should work as an expression', function () {
        var input = 'query("""\nhello\nworld""");';
        var output = 'query(\n\n"hello\\nworld");';
        test(input, output);
    });

    it('should strip a leading newline', function () {
        test('"""\nhello\n"""', '\n\n"hello\\n"');
    });

    it('should escape newline characters', function () {
        test('"""one\ntwo"""', '\n"one\\ntwo"');
    });

    it('should strip any trailing whitespace after the final newline', function () {
        test('"""\n    hello\n    """', '\n\n"hello\\n"');
    });

    it('should preserve any trailing whitespace on intermediate lines', function () {
        test('"""hello """', '"hello "');
    });

    it('should remove excess indentation', function () {
        test('"""\n    one\n    two\n"""', '\n\n\n"one\\ntwo\\n"');
    });

    it('should preserve additional indentation', function () {
        test('"""\n    one\n        two\n"""', '\n\n\n"one\\n    two\\n"');
    });

    it('should indent consistently, even if a subsequent line has less indentation', function () {
        test('"""\n    one\n  two\n"""', '\n\n\n"  one\\ntwo\\n"');
    });

    it('should accept Buffer objects as input', function () {
        test(new Buffer('hello'), 'hello');
    });

    it('should not strip backslash-escapes', function () {
        test('"a\\tb\\\\c"');
    });

    it('should not strip newlines generated from escape characters in normal strings', function () {
        test('"hello\\n"');
    });

    it('should not strip newlines generated from escape characters', function () {
        test('"""hello\\n"""', '"hello\\n"');
    });

    it('should preserve text surrounding long comments', function () {
        test('a/* x */z');
    });

    it('should preserve text surrounding short comments', function () {
        test('a// x\nz');
    });

    it('should ignore quotes inside long comments', function () {
        test('/* " */');
    });

    it('should ignore quotes inside short comments', function () {
        test('// "');
    });

    it('should ignore quotes inside regex', function () {
        test('replace(/"/g, "x")');
    });

    it('should parse regex', function () {
        test('replace(/["a-b]/g, "x")');
        test('replace(/\\n/g, "x")');
        test('replace(/a/\n, "x")');
        test('replace(/a/g\n, "x")');
        test('replace(/a/g.test(), "x")');
        test('replace(/a///inline """foo""" comment\n, "x")');
        test('return /"""/');
        test('throw /"""/');
        test('if (true) /"""/');
    });

    it('should parse divide', function () {
        test('(b) / a');
    });

    it('should throw an error for unterminated regex', function () {
        error('replace(/\\/g, "x")', '<stdin>:1:19: error: Invalid regular expression: missing /');
        error('replace(/\n', '<stdin>:1:11: error: Invalid regular expression: missing /');
        error('replace(/\\\n', '<stdin>:1:12: error: Invalid regular expression: missing /');
    });

    it('should throw an error for invalid regex', function () {
        error('replace(/a/X, "x")', '<stdin>:1:13: error: Invalid regular expression');
    });

    it('should not remove divide symbols', function () {
        test('a / b');
    });

    it('should preserve a trailing newline', function () {
        test('"""\n    hello\n    """', '\n\n"hello\\n"');
    });

    it('should preserve CRLF', function () {
        test('\r\n');
    });

    it('should convert CRLF to CR inside comments', function () {
        test('"""a\r\nb"""', '\n"a\\nb"');
    });

    it('should parse line comments', function () {
        test('// foo');
    });

    it('should parse line comments with CR endings', function () {
        test('// foo\n');
    });

    it('should parse line comments with CRLF endings', function () {
        test('// foo\r\n');
    });

    it('should parse block comments', function () {
        test('/* foo */');
    });

    it('should parse block comments with CR endings', function () {
        test('/* foo\n*/');
    });

    it('should parse block comments with CRLF endings', function () {
        test('/* foo\r\n*/');
    });

    it('should parse es6 template strings (backticks)', function () {
        test('`foo`');
    });

    it('should preserve exact whitespace in single backticks (es6 compatibility)', function () {
        test('`    foo\n    bar\n`');
    });

    it('should preserve CRLF in single backticks (es6 compatibility)', function () {
        test('`    foo\r\n    bar\r\n`');
    });

    it('should not escape newlines within backticks', function () {
        test('```foo\nbar\n```', '`foo\nbar\n`');
    });

    it('should remove excess whitespace from triple backticks', function () {
        test('```    foo\n    bar\n```', '`foo\nbar\n`');
    });

    it('should preserve backslash-escaped newlines', function () {
        test('"foo\\\nbar"');
    });

    it('should preserve backslash-escaped CRLF newlines', function () {
        test('"foo\\\r\nbar"');
    });

    it('should parse division', function () {
        test('1 / 3');
    });

    it('should parse division without spaces', function () {
        test('1/3');
    });

    it('should parse division in a function', function () {
        test('foo(1/3)');
    });

    it('should parse integer division without whitespace', function () {
        test('foo(bar, 1/3)');
    });

    it('should not detect keywords in identifiers', function () {
        test('foo(noreturn / 2)');
    });

    it('should parse JSX tags', function () {
        test('<Foo></Foo>');
    });

    it('should parse self-closing JSX', function () {
        test('<Foo />');
    });

    it('should parse JSX tags with content', function () {
        test('<Foo>hello</Foo>');
    });

    it('should parse JSX keys', function () {
        test('<a href="http://example.com" />');
        test("<a href='http://example.com' />");
    });

    it('should ignore quotes inside JSX', function () {
        test('<span>"</span>');
        test("<span>'</span>");
    });

    it('should parse JSX expressions', function () {
        test('<Foo bar={ """baz""" } />', '<Foo bar={ "baz" } />');
    });

    it('should parse JSX tags with literal content', function () {
        test('<Foo>"""hello"""</Foo>');
    });

    it('should parse JSX tags with dot-identifiers', function () {
        test('<foo.Bar />');
    });

    it('should parse nested JSX tags', function () {
        test('<Foo><Bar><Baz /></Bar></Foo>');
    });

    it('should parse JSX in arrow functions', function () {
        test('data.map(x => <Foo />)');
        test('data.map(x => <Foo>bar</Foo>)');
        test('data.map(x => <Foo><Bar><Baz /></Bar></Foo>)');
    });

    it('should parse strings in arrow functions', function () {
        test('data.map(x => """hello""")', 'data.map(x => "hello")');
    });

    it('should ignore block comments in JSX', function () {
        test('<Foo>/*</Foo>');
    });

    it('should ignore line comments in JSX', function () {
        test('<Foo>// hello</Foo>');
    });

    it('should throw an error if JSX tag is not closed', function () {
        error('<Foo>', '<stdin>:1:6: error: Missing closing tag for JSX element: Foo');
    });

    it('should throw an error if JSX tag is not closed properly', function () {
        error('<Foo /*>', '<stdin>:1:7: error: Unexpected token: "*" (expected: ">")');
    });

    it('should throw an error if JSX tag is closed with a different identifier', function () {
        error('<Foo></Bar>', '<stdin>:1:11: error: Wrong closing tag for JSX element: Foo');
    });

    it('should give correct line numbers for JSX', function () {
        error('<Foo>\n<Bar />\n</Foo>\n"', '<stdin>:4:2: error: Unterminated string');
    });

    it('should throw an error if a normal string contains a newline', function () {
        error('"foo\nbar', '<stdin>:1:6: error: Unterminated string');
    });

    it('should throw an error if a normal string is not ended before EOF', function () {
        error('"foo', '<stdin>:1:5: error: Unterminated string');
    });

    it('should throw an error if a block comment is not ended before EOF', function () {
        error('/*', '<stdin>:1:3: error: Unterminated block comment');
        error('/* foo', '<stdin>:1:7: error: Unterminated block comment');
        error('/* foo\n', '<stdin>:2:1: error: Unterminated block comment');
        error('/* foo\r\n', '<stdin>:2:1: error: Unterminated block comment');
    });

    it('should throw an error for unterminated brackets', function () {
        error('(', '<stdin>:1:2: error: Unterminated block: missing )');
        error('[', '<stdin>:1:2: error: Unterminated block: missing ]');
        error('{', '<stdin>:1:2: error: Unterminated block: missing }');
    });

    it('should work with stream input', function (done) {
        var input = 'var x = """\n    hello\n    world\n"""';
        var expected = 'var x = \n\n\n"hello\\nworld\\n"';
        var stream = es.readArray(input.split(''));
        triplet(stream).pipe(es.wait(function (err, output) {
            if (err) return done(err);
            assert.equal(output.toString(), expected);
            done();
        }));
    });

    it('should work with buffer input', function () {
        var input = 'var x = """\n    hello\n    world\n"""';
        var expected = 'var x = \n\n\n"hello\\nworld\\n"';
        var buffer = new Buffer(input);
        var output = triplet(buffer);
        assert.equal(output, expected);
    });

    it('should work with string input', function () {
        var input = 'var x = """\n    hello\n    world\n"""';
        var expected = 'var x = \n\n\n"hello\\nworld\\n"';
        var output = triplet(input);
        assert.equal(output, expected);
    });
});

describe('examples', function () {
    var dir = __dirname + '/../examples';
    var files = fs.readdirSync(dir);
    files.forEach(function (file) {
        var index = file.indexOf('.js');
        if (index < 0) {
            return;
        }
        var name = file.substring(0, index);
        if (fs.existsSync(dir + '/' + name + '.out')) {
            it(file, function () {
                this.timeout(60000);
                var inFile = dir + '/' + name + '.js';
                var input = fs.readFileSync(inFile);
                var expected = fs.readFileSync(dir + '/' + name + '.out').toString();
                test(input, expected, { filename: 'examples/' + name + '.js' });
            });
        } else {
            it(file);
        }
    });
});
