import { config } from "../../package.json";

export interface SkillDef {
  name: string;
  icon?: string;
  description?: string;
  order?: number;
  prompt: string;
}

const BUILTIN_FILENAMES = [
  "summarize.md",
  "find-gaps.md",
  "compare-methods.md",
  "key-concepts.md",
  "implications.md",
];

const CHROME_SKILLS_BASE = `chrome://${config.addonRef}/content/skills/`;

function getSkillsDir(): string {
  return PathUtils.join(Zotero.DataDirectory.dir, "sentai", "skills");
}

export async function initSkillsFolder(): Promise<void> {
  const dir = getSkillsDir();
  await IOUtils.makeDirectory(dir, { createAncestors: true });

  // Always overwrite built-in defaults so plugin updates are reflected immediately.
  // User-created files (not in BUILTIN_FILENAMES) are never touched.
  for (const filename of BUILTIN_FILENAMES) {
    const destPath = PathUtils.join(dir, filename);
    try {
      const content = Zotero.File.getContentsFromURL(
        `${CHROME_SKILLS_BASE}${filename}`,
      );
      await IOUtils.writeUTF8(destPath, content);
    } catch (e) {
      Zotero.log(`sentAI: could not copy default skill "${filename}": ${e}`);
    }
  }
}

function parseFrontmatter(content: string): {
  meta: Record<string, string | number>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Record<string, string | number> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();
    const num = Number(raw);
    meta[key] = isNaN(num) || raw === "" ? raw : num;
  }

  return { meta, body: match[2].trim() };
}

export async function loadSkills(): Promise<SkillDef[]> {
  const dir = getSkillsDir();

  let children: string[];
  try {
    children = await IOUtils.getChildren(dir);
  } catch {
    return [];
  }

  const mdFiles = children.filter((p) => p.endsWith(".md"));
  const skills: SkillDef[] = [];

  for (const filePath of mdFiles) {
    try {
      const content = await IOUtils.readUTF8(filePath);
      const { meta, body } = parseFrontmatter(content);

      const name = typeof meta.name === "string" ? meta.name : "";
      if (!name) continue;

      skills.push({
        name,
        icon: typeof meta.icon === "string" ? meta.icon : undefined,
        description:
          typeof meta.description === "string" ? meta.description : undefined,
        order: typeof meta.order === "number" ? meta.order : undefined,
        prompt: body,
      });
    } catch {
      // skip malformed files silently
    }
  }

  skills.sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  return skills;
}

export function openSkillsFolder(): void {
  const dir = getSkillsDir();
  try {
    const nsFile = (Components as any).classes[
      "@mozilla.org/file/local;1"
    ].createInstance((Components as any).interfaces.nsILocalFile);
    nsFile.initWithPath(dir);
    nsFile.reveal();
  } catch {
    try {
      Zotero.launchURL(`file://${dir}`);
    } catch {
      Zotero.log(`sentAI: could not open skills folder at ${dir}`);
    }
  }
}
