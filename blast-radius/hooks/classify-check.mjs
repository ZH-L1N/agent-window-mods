import { classify, classifyAll, stripTrailingRedirects } from "./blast-radius.mjs";

let fails = 0;
function expect(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}`);
  if (!ok) fails += 1;
}
function timed(name, fn, limitMs = 500) {
  const t0 = Date.now();
  fn();
  const ms = Date.now() - t0;
  console.log(`${ms < limitMs ? "ok  " : "FAIL"} ${name} in ${ms} ms`);
  if (ms >= limitMs) fails += 1;
}

// Held
expect("rm -rf build", classify("rm -rf build")?.kind, "rm");
expect("cd x && rm -rf build", classify("cd x && rm -rf build")?.dir, "x");
expect("git reset --hard", classify("git reset --hard HEAD~1")?.kind, "git-reset");
expect("git push -f", classify("git push -f origin main")?.kind, "git-push-force");
expect("git clean -fdx", classify("git clean -fdx")?.kind, "git-clean");
expect("alembic upgrade head", classify("alembic upgrade head")?.kind, "migrate");
expect("python3 manage.py migrate", classify("python3 manage.py migrate")?.kind, "migrate");
expect("find -exec migrate", classify("find . -name x -exec python manage.py migrate \\;")?.kind, "migrate");
expect("git submodule foreach alembic", classify('git submodule foreach "alembic upgrade head"')?.kind, "migrate");
expect("echo $(prisma migrate)", classify('echo "$(npx prisma migrate deploy)"')?.kind, "migrate");

// Scope after a subshell with redirects (fd-dup regression)
expect("(cd sub && make) > log; rm -rf out -> dir null", classify("(cd sub && make) > log; rm -rf out")?.dir, null);
expect("(cd sub && make) >/dev/null 2>&1; rm -rf build -> dir null", classify("(cd sub && make) >/dev/null 2>&1; rm -rf build")?.dir, null);
expect("(cd sub && make) 2>&1 | tail; rm -rf build -> dir null", classify("(cd sub && make) 2>&1 | tail; rm -rf build")?.dir, null);

// Every risky segment is collected
expect("two rms", classifyAll("rm -rf a; echo ok; rm -rf b").map((r) => r.targets[0]), ["a", "b"]);
expect("rm then reset", classifyAll("rm -rf a && git reset --hard").map((r) => r.kind), ["rm", "git-reset"]);

// Not held
expect("grep alembic upgrade", classify("grep -rn 'alembic upgrade' ."), null);
expect("cat migrate notes", classify("cat docs/manage.py-migrate-notes.md"), null);
expect("echo db:migrate", classify("echo 'run db:migrate later'"), null);
expect("git commit -m migrate", classify('git commit -m "alembic upgrade applied"'), null);
expect("git log --grep migrate", classify("git log --grep 'manage.py migrate'"), null);
expect("rm single", classify("rm file.txt"), null);
expect("git restore --staged", classify("git restore --staged ."), null);

// Redirect stripping
expect("strip > log", stripTrailingRedirects("(cd sub && make) > log"), "(cd sub && make)");
expect("strip 2>>err &", stripTrailingRedirects("(x) 2>>err &"), "(x)");
expect("strip &> out", stripTrailingRedirects("cmd &> out"), "cmd");
expect("strip 2>&1", stripTrailingRedirects(" make) >/dev/null 2>&1"), " make)");
expect("strip >&2", stripTrailingRedirects(" make) >&2"), " make)");
expect("strip 1>&2", stripTrailingRedirects(" make) 1>&2"), " make)");
expect("strip 2>&-", stripTrailingRedirects("x) 2>&-"), "x)");
expect("strip none", stripTrailingRedirects("ls -la"), "ls -la");
expect("strip keeps head", stripTrailingRedirects("a".repeat(3000) + " > log"), "a".repeat(3000));

// Adversarial inputs stay fast
timed("40kB '>' segment", () => classify("(" + " >".repeat(20000) + " x"));
timed("100k spaces", () => classify("rm -rf build" + " ".repeat(100000)));
timed("100k digits redirect", () => classify("(x) " + "9".repeat(100000) + "> log"));
timed("100k spaces mid", () => classify("(cd a" + " ".repeat(100000) + ") > log; rm -rf b"));
timed("many redirects", () => stripTrailingRedirects("x" + " > a".repeat(5000)));

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
