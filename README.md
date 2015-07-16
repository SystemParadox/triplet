# Triplet

Triple-quoted strings for everyone!

Here-documents and multiline strings done right.

This is a simple source-source transformer for python-style triple-quoted strings.
It can be used standalone or as an input preprocessor to another compiler (e.g. babel, sweetjs).

## Rationale

ES6 template strings (delimited by single-backticks) are a great improvement, but still have some
issues:

- Backticks must be escaped, which is really painful for SQL
- Indentation/whitespace is not correct
- Sometimes you want a literal, without interpreting `${}` as template expressions

## Correct indentation

Both ES6 template strings and Python triple-quoted strings take
everything between the opening and closing quotes literally and exactly,
without consideration for the starting indentation:

```
function fail() {
....return `
........foo
........bar
....`;
}

// equivalent to
function fail() {
    return "\n........foo\n........bar\n....";
}
```

(spaces have been replaced with periods '.' for illustration)

Notice the leading newline plus `n` levels of indentation, and trailing newline with `n-1` levels of indentation.
In order words, a complete mess.

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

## Compatibility

This is purposely designed to be simple as possible, with minimal knowledge of the language concerned.
This means that you can use it with arbitrary other languages or language extensions:

- sweetjs macros
- es6/es7 transpilers
- C
- Java
- Python

It can be used for any language, provided it conforms to the following rules:

- Strings begin with single-quotes `'`, double-quotes `"` or backticks `\'`
- Round brackets `()`, square brackets `[]` and curly braces `{}` must be paired correctly

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

## Line numbers / source maps

Triplet preserves line numbering such that source maps are unnecessary.
Output strings are padded with newlines accordingly:

```
    x = """
        foo
    """
```

Becomes:

```
    x = \n
    \n
    "foo\n"
```

## Command line

```
triplet [file]
```

## API

```
var triplet = require('triplet');
triplet(input, options);
```

## TODO

- Better stream support
- Ensure sensible support for mixed tabs/spaces