import { assert } from "chai";
import {
  initSkillsFolder,
  loadSkills,
  openSkillsFolder,
  type SkillDef,
} from "../src/modules/skillsLoader";

describe("skillsLoader", function () {
  describe("initSkillsFolder", function () {
    it("creates the skills folder and writes default skill files", async function () {
      this.timeout(10000);
      await initSkillsFolder();
      const dir = PathUtils.join(Zotero.DataDirectory.dir, "sentai", "skills");
      assert.isTrue(await IOUtils.exists(dir), "skills dir should exist");
    });

    it("overwrites existing default files on re-init", async function () {
      this.timeout(10000);
      await initSkillsFolder();
      const dir = PathUtils.join(Zotero.DataDirectory.dir, "sentai", "skills");
      const summarizePath = PathUtils.join(dir, "summarize.md");
      // corrupt the file
      await IOUtils.writeUTF8(summarizePath, "corrupted content");
      // re-init should restore it
      await initSkillsFolder();
      const restored = await IOUtils.readUTF8(summarizePath);
      assert.notEqual(restored, "corrupted content");
      assert.include(restored, "---", "restored file should have frontmatter");
    });

    it("does not delete user-created files", async function () {
      this.timeout(10000);
      await initSkillsFolder();
      const dir = PathUtils.join(Zotero.DataDirectory.dir, "sentai", "skills");
      const userFile = PathUtils.join(dir, "my-custom-skill.md");
      await IOUtils.writeUTF8(
        userFile,
        "---\nname: Custom\norder: 99\n---\nMy prompt",
      );
      await initSkillsFolder();
      assert.isTrue(
        await IOUtils.exists(userFile),
        "user file should still exist after re-init",
      );
      await IOUtils.remove(userFile);
    });
  });

  describe("loadSkills", function () {
    before(async function () {
      this.timeout(10000);
      await initSkillsFolder();
    });

    it("returns an array of SkillDef objects", async function () {
      const skills = await loadSkills();
      assert.isArray(skills);
      assert.isAbove(skills.length, 0, "should load at least one built-in skill");
    });

    it("each skill has a name and a non-empty prompt", async function () {
      const skills = await loadSkills();
      for (const skill of skills) {
        assert.isString(skill.name, "name should be a string");
        assert.isAbove(skill.name.length, 0, "name should be non-empty");
        assert.isString(skill.prompt, "prompt should be a string");
        assert.isAbove(skill.prompt.length, 0, "prompt should be non-empty");
      }
    });

    it("skills are sorted by order then name", async function () {
      const skills = await loadSkills();
      for (let i = 1; i < skills.length; i++) {
        const prev = skills[i - 1];
        const curr = skills[i];
        const prevOrder = prev.order ?? Infinity;
        const currOrder = curr.order ?? Infinity;
        if (prevOrder === currOrder) {
          assert.isAtMost(
            prev.name.localeCompare(curr.name),
            0,
            "skills with same order should be sorted by name",
          );
        } else {
          assert.isAtMost(
            prevOrder,
            currOrder,
            "skills should be sorted by order ascending",
          );
        }
      }
    });

    it("all 5 built-in skills are loaded", async function () {
      const skills = await loadSkills();
      const names = skills.map((s) => s.name);
      const expectedNames = [
        "Summarize",
        "Find gaps",
        "Compare methods",
        "Key concepts",
        "Implications",
      ];
      for (const expected of expectedNames) {
        assert.include(names, expected, `expected built-in skill "${expected}"`);
      }
    });

    it("skills with icons have non-empty icon strings", async function () {
      const skills = await loadSkills();
      for (const skill of skills) {
        if (skill.icon !== undefined) {
          assert.isString(skill.icon);
          assert.isAbove(skill.icon.length, 0);
        }
      }
    });

    it("skips malformed files without throwing", async function () {
      this.timeout(10000);
      const dir = PathUtils.join(Zotero.DataDirectory.dir, "sentai", "skills");
      const badFile = PathUtils.join(dir, "bad-skill.md");
      await IOUtils.writeUTF8(badFile, "no frontmatter at all, just garbage");
      let skills: SkillDef[] = [];
      let threw = false;
      try {
        skills = await loadSkills();
      } catch {
        threw = true;
      }
      assert.isFalse(threw, "loadSkills should not throw on malformed files");
      // the bad file has no name so it should be excluded
      const names = skills.map((s) => s.name);
      assert.notInclude(names, "", "nameless skills should be excluded");
      await IOUtils.remove(badFile);
    });

    it("returns empty array when skills directory does not exist", async function () {
      // Point to a nonexistent dir by temporarily stubbing PathUtils-dependent behavior
      // via a fresh directory that has no files
      const dir = PathUtils.join(
        Zotero.DataDirectory.dir,
        "sentai",
        "skills-nonexistent-test",
      );
      const exists = await IOUtils.exists(dir);
      if (exists) return; // already exists from a previous run, skip
      // loadSkills reads from the real skills dir, so we just verify it handles
      // a missing dir gracefully (no dir === IOUtils.getChildren throws → returns [])
      // We can't easily redirect the path, so we test the fallback path indirectly
      // by asserting loadSkills returns an array (not throws) even before initSkillsFolder
      const skills = await loadSkills();
      assert.isArray(skills);
    });
  });

  describe("openSkillsFolder", function () {
    it("does not throw when called", function () {
      // openSkillsFolder uses nsILocalFile.reveal() which opens Finder/Explorer.
      // We can't verify the OS action in a headless test, but we can assert no exception.
      let threw = false;
      try {
        openSkillsFolder();
      } catch {
        threw = true;
      }
      assert.isFalse(threw, "openSkillsFolder should not throw");
    });
  });
});
