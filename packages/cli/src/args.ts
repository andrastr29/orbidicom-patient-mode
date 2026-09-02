export type Command = "serve" | "init" | "ai" | "generate";

export interface CliOptions {
  command: Command;
  pacs?: string;
  study?: string;
  auth?: "none" | "basic" | "bearer" | "cookie";
  /** Bearer token (with --auth bearer). */
  token?: string;
  /** Basic-auth credentials (with --auth basic). */
  username?: string;
  password?: string;
  port: number;
  open: boolean;
  rest: string[];
  /** Enable the in-app AI & Results panel (serve). */
  ai?: boolean;
  /**
   * Patient-facing mode (serve): hides the study-management and image-export
   * affordances (Add study, New study, Download image as JPG).
   */
  patient?: boolean;
}

const COMMANDS = new Set<Command>(["serve", "init", "ai", "generate"]);

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { command: "serve", port: 4173, open: true, rest: [] };
  let i = 0;
  if (argv[0] && COMMANDS.has(argv[0] as Command)) {
    opts.command = argv[0] as Command;
    i = 1;
  } else if (argv[0] === "create") {
    opts.command = "init";
    i = 1;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--pacs":
        opts.pacs = argv[++i];
        break;
      case "--study":
        opts.study = argv[++i];
        break;
      case "--auth":
        opts.auth = argv[++i] as CliOptions["auth"];
        break;
      case "--token":
        opts.token = argv[++i];
        break;
      case "--username":
        opts.username = argv[++i];
        break;
      case "--password":
        opts.password = argv[++i];
        break;
      case "--port":
        opts.port = Number(argv[++i]);
        break;
      case "--open":
        opts.open = true;
        break;
      case "--no-open":
        opts.open = false;
        break;
      case "--ai":
        opts.ai = true;
        break;
      case "--patient":
        opts.patient = true;
        break;
      default:
        if (a) opts.rest.push(a);
    }
  }
  return opts;
}
