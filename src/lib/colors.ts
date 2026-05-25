import kleur from "kleur";

// Honor NO_COLOR / non-TTY. kleur already auto-detects, but be explicit.
if (process.env.NO_COLOR || !process.stdout.isTTY) {
  kleur.enabled = false;
}

export const c = {
  green: (s: string) => kleur.green(s),
  yellow: (s: string) => kleur.yellow(s),
  red: (s: string) => kleur.red(s),
  blue: (s: string) => kleur.blue(s),
  dim: (s: string) => kleur.gray(s),
  bold: (s: string) => kleur.bold(s),
};

export const sym = {
  ok: "✓",
  fail: "✗",
  arrow: "→",
  dots: "…",
};
