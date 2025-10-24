export function boot(): void {
  // Placeholder entrypoint — replaced when Discord bot boots.
  // Keeping it simple for T0.1; testing ensures toolchain works.
  // eslint-disable-next-line no-console
  console.log("Infinity Gauntlet: toolchain online.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot();
}
