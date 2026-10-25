package markdown

import (
	"regexp"
	"strings"
)

var (
	displayDelimiter = regexp.MustCompile(`^ {0,3}\$\$[\t ]*$`)
	codeDelimiter    = regexp.MustCompile("^ {0,3}(`{3,}|~{3,})(.*)$")
	equationEquals   = regexp.MustCompile(`^ {0,3}=[\t ]*\r?$`)
)

// mathSafetySource escapes only an independent equation equals sign for the GFM
// safety parse. It never alters storage/rendering, skips math, or relaxes other H1,
// HTML, link or image checks. Fenced code cannot supply a false math opener.
func mathSafetySource(source string) string {
	lines := strings.Split(source, "\n")
	start := -1
	fence := ""
	for i, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if start < 0 {
			code := codeDelimiter.FindStringSubmatch(line)
			if fence != "" {
				if code != nil && code[1][0] == fence[0] && len(code[1]) >= len(fence) && strings.TrimSpace(code[2]) == "" {
					fence = ""
				}
				continue
			}
			if code != nil {
				fence = code[1]
				continue
			}
		}
		if !displayDelimiter.MatchString(line) {
			continue
		}
		if start < 0 {
			start = i
			continue
		}
		for j := start + 1; j < i; j++ {
			if equationEquals.MatchString(lines[j]) {
				lines[j] = strings.Replace(lines[j], "=", `\=`, 1)
			}
		}
		start = -1
	}
	return strings.Join(lines, "\n")
}
