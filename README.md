# Triplet

Triple-quoted strings for everyone!

Here-documents and multiline strings done right.

This is a simple source-source transformer for python-style triple-quoted strings.
It can be used standalone or as an input preprocessor to another compiler (e.g. babel, sweetjs).

## Rationale

JavaScript is lacking when it comes to raw string literals, especially for multi-line strings.
ES6 template strings (delimited by single-backticks) are a great improvement, but still have some issues:

- Any backticks in the text must still be escaped, which is really bad for SQL and Markdown
- Indentation/whitespace is not correct
- Sometimes you want a literal, without interpreting `${}` as template expressions

## Correct indentation

Both ES6 template strings and Python triple-quoted strings take
everything between the opening and closing quotes literally and exactly,
without consideration for the starting indentation:

```
function fail() {
    return `
        foo
        bar
    `;
}

// equivalent to
function fail() {
    return "\n        foo\n        bar\n    ";
}
```

Notice the leading newline plus `n` levels of indentation, and trailing newline with `n-1` levels of indentation.
In other words, a complete mess.

With triplet, the indentation is taken into account:

```
function nice() {
    return """
        foo
        bar
    """;
}

// equivalent to
function nice() {
    return "foo\nbar\n";
}
```

Additional indentation within the string is preserved:

```
function other() {
    return """
        foo
            bar
        baz
    """;
}

// equivalent to
function other() {
    return "foo\n    bar\nbaz";
}
```

The rules are as follows:

- Any leading newline is removed
- Any whitespace up to the first non-whitespace character is taken as the starting indentation
- The starting indentation is removed from any subsequent lines
- Any trailing whitespace after the last newline is removed
- The final newline is preserved to allow easy concatenation, and avoids 'missing newline at end of file'

## Compatibility

This is purposely designed to be simple as possible, with minimal knowledge of the language concerned.
It can be used for any language, provided it conforms to the following rules:

- Strings begin with single-quotes `'`, double-quotes `"` or backticks `\'`
- Round brackets `()`, square brackets `[]` and curly braces `{}` must be paired correctly
- Comments are delimited by `/* ... */` or `//`

Use it standalone for plain Javascript, or as an input preprocessor for sweetjs, 6to5, babel, etc. You could even use it for C or Java!

## Regular expressions

A special case must be made to support Javascript's regular expressions, because they may contain quotes and brackets.
A parser strictly conforming to the ECMAScript specification requires contextual information and full understanding of the language.
However, it is possible to parse 95% of real-world cases without this.
By adding knowledge of `return` and `if`, it is possible to increase this to 99%.
The other 1% is stupid and results in runtime errors anyway.

When a `/` is encountered, the parser will look back to determine whether it should be parsed as a regex or not:

- If the previous (non-whitespace) character is one of `(,=:[!&|?{;` then it is a regex
- If the previous token is `return` then it is a regex
- If it is a `)`, look back to the token before the matching `(`. If it is `if` then regex
- If it is a `}`, assume a regex

This deviates from the ECMAScript specification for the following cases:

- `x = function x() {} /` (a function expression) will be parsed as a regex, but dividing a function doesn't make sense anyway
- `x = {} /` will be parsed as a regex, but dividing an object literal doesn't make sense anyway
- some other cases which would normally cause specific parse errors (e.g. `while /regex/` or `while () /regex/`) will
instead cause parse errors for unterminated regex

A huge thanks to the mozilla/sweet.js folks for their excellent work on this.

## JSX support

*New in version 1.1.0*

JSX support has also been added, but must be explicitly requested with the `--jsx` command line option (or `jsx: true` for API usage).

## Line numbers / source maps

Triplet preserves line numbering such that source maps should be unnecessary.
Output strings are padded with newlines accordingly:

```
x = """
    foo
""";
```

Becomes:

```
x =

"foo\n";
```

## Command line

```
triplet [file]
```

- If file is '-', or not specified, reads from stdin.

## API

```
var triplet = require('triplet');
triplet(input, options);
```

- If input is a string or buffer, a string will be returned.
- If input is a stream, a stream will be returned.

## TODO

- Ensure sensible support for mixed tabs/spaces
- Better stream support

## Contributing

All feedback, bug reports or pull requests will be much appreciated! Please open an issue on github.
