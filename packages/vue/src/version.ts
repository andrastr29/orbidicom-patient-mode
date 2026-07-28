// The version shown in the viewer's About row. Read straight from package.json
// so a `npm version` / `changeset version` bump can never drift from what the UI
// reports (core, vue and the CLI ship lockstepped on one version).
import pkg from "../package.json";

export const VERSION: string = pkg.version;
