// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      files: ["**/*.d.ts"],
      rules: {
        // Allow /// <reference path> in declaration files
        "@typescript-eslint/triple-slash-reference": [
          "error",
          { path: "always" },
        ],
      },
    },
  ],
});
