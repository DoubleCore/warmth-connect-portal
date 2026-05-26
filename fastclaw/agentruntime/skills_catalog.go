package agentruntime

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type skillSummary struct {
	Name        string
	Description string
	Path        string
}

var frontMatterFieldPattern = regexp.MustCompile(`(?m)^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$`)

// BuildSkillsSummary scans agent skill directories and returns a compact catalog
// that tells the model which local SKILL.md files it can read on demand.
func BuildSkillsSummary(home string, extraDirs []string) string {
	dirs := skillDirs(home, extraDirs)
	if len(dirs) == 0 {
		return ""
	}

	seen := map[string]bool{}
	skills := make([]skillSummary, 0)
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillFile := filepath.Join(dir, entry.Name(), "SKILL.md")
			info, err := os.Stat(skillFile)
			if err != nil || info.IsDir() {
				continue
			}
			key := filepath.Clean(skillFile)
			if seen[key] {
				continue
			}
			seen[key] = true
			skills = append(skills, readSkillSummary(entry.Name(), skillFile))
		}
	}

	if len(skills) == 0 {
		return ""
	}

	sort.Slice(skills, func(i, j int) bool {
		return skills[i].Name < skills[j].Name
	})

	var b strings.Builder
	b.WriteString("You have local FastClaw skills. When the user task matches a skill, read that skill file with read_file before acting, then follow it.\n")
	for _, skill := range skills {
		desc := skill.Description
		if desc == "" {
			desc = "No description provided."
		}
		fmt.Fprintf(&b, "- %s: %s\n  path: %s\n", skill.Name, desc, filepath.ToSlash(skill.Path))
	}
	return strings.TrimSpace(b.String())
}

func skillDirs(home string, extraDirs []string) []string {
	candidates := make([]string, 0, len(extraDirs)+3)
	if home != "" {
		candidates = append(candidates, filepath.Join(home, "skills"))
		parent := filepath.Dir(home)
		if parent != "." && parent != string(filepath.Separator) {
			candidates = append(candidates, filepath.Join(parent, "skills"))
		}
	}
	candidates = append(candidates, extraDirs...)

	seen := map[string]bool{}
	dirs := make([]string, 0, len(candidates))
	for _, dir := range candidates {
		if dir == "" {
			continue
		}
		abs, err := filepath.Abs(dir)
		if err != nil {
			abs = filepath.Clean(dir)
		}
		if seen[abs] {
			continue
		}
		info, err := os.Stat(abs)
		if err == nil && info.IsDir() {
			seen[abs] = true
			dirs = append(dirs, abs)
		}
	}
	return dirs
}

func readSkillSummary(defaultName, path string) skillSummary {
	data, err := os.ReadFile(path)
	if err != nil {
		return skillSummary{Name: defaultName, Path: path}
	}
	text := string(data)
	fields := parseFrontMatterFields(text)
	name := strings.Trim(fields["name"], ` "'`)
	if name == "" {
		name = defaultName
	}
	description := strings.Trim(fields["description"], ` "'`)
	if description == "" {
		description = firstHeadingOrParagraph(text)
	}
	return skillSummary{
		Name:        name,
		Description: truncateOneLine(description, 260),
		Path:        path,
	}
}

func parseFrontMatterFields(text string) map[string]string {
	fields := map[string]string{}
	trimmed := strings.TrimLeft(text, "\ufeff\r\n\t ")
	if !strings.HasPrefix(trimmed, "---") {
		return fields
	}
	rest := strings.TrimPrefix(trimmed, "---")
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return fields
	}
	frontMatter := rest[:end]
	for _, match := range frontMatterFieldPattern.FindAllStringSubmatch(frontMatter, -1) {
		fields[strings.ToLower(match[1])] = strings.TrimSpace(match[2])
	}
	return fields
}

func firstHeadingOrParagraph(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || line == "---" || strings.Contains(line, ":") {
			continue
		}
		return strings.TrimPrefix(line, "#")
	}
	return ""
}

func truncateOneLine(text string, max int) string {
	text = strings.Join(strings.Fields(text), " ")
	if len(text) <= max {
		return text
	}
	if max <= 3 {
		return text[:max]
	}
	return text[:max-3] + "..."
}
