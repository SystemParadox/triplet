.PHONY: all
all:

.PHONY: test
test:
	mocha --bail $(file)

.PHONY: coverage
coverage:
	mocha -r blanket -R html-cov > test/coverage.html
