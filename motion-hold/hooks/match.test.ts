import { expect, test } from 'claude-code/testing'

import { classify, clean, hostOf, parseConfig } from './match'
import type { ConfigRead, HoldKind, Verdict } from './match'

/** The neutral example config of the README and examples/motion-hold.example.json. */
const EXAMPLE = JSON.stringify({
  hosts: ['rig-1.local', '10.0.0.*'],
  hold: ['\\bctl\\s+(move|jog|home|drive)\\b', '\\bbench/[\\w-]+\\.sh\\b'],
  stop: ['\\bctl\\s+stop\\b'],
  stopCommand: ['ssh', '{host}', 'ctl stop all'],
})
const OK = parseConfig(EXAMPLE)
const NONE = parseConfig(null)
const BROKEN = parseConfig('{')

type Why = 'no-match' | 'stop' | 'read-only'
type Want =
  | { hold: true; kind: HoldKind; host?: string | null; isCertain?: boolean }
  | { hold: false; why?: Why }
type Case = { n: string; command: string; read?: ConfigRead; want: Want }

const hold = (kind: HoldKind, host?: string | null, isCertain = true): Want => ({
  hold: true,
  kind,
  ...(host !== undefined ? { host } : {}),
  isCertain,
})
const pass = (why?: Why): Want => ({ hold: false, ...(why ? { why } : {}) })

const PY8 = "python3 - <<'PY'\nc.write_register(64, 1)\nPY"

// ---- Builders for the rows of the third review round (260 on): long commands made of harmless statements.

/** `n` statements joined by `sep`. */
const many = (n: number, f: (i: number) => string, sep = '\n'): string => Array.from({ length: n }, (_, i) => f(i)).join(sep)
/** Arithmetic assignments with inner parentheses: each is read a second time, the earlier way. */
const arith = (n: number): string => many(n, i => `x${i}=$(( (a+${i})*2 ))`, '; ')
/** `echo "$(echo "$( ... x ... )")"`, `k` levels: a closed nest of quoted substitutions. */
const quotedNest = (k: number): string => {
  let s = 'x'
  for (let i = 0; i < k; i++) s = `echo "$(${s})"`
  return s
}
/** `"${a:-"${a:- ... x ... }"}"`, `k` levels. */
const braceNest = (k: number): string => {
  let s = 'x'
  for (let i = 0; i < k; i++) s = '"${a:-' + s + '}"'
  return s
}
/** `echo "${a:-${b}}" $(echo "${a:-${b}}" $( ... ))`: `k` substitutions nested in one another, each text read twice. */
const nestedDefaults = (k: number): string => {
  let s = 'echo "${a:-${b}}"'
  for (let i = 0; i < k; i++) s = 'echo "${a:-${b}}" $(' + s + ')'
  return s
}
/** `"${a:-''"${a:-'' ... x ... }"}"`, `k` levels: a single quote inside every pair of braces. */
const quoteInBraces = (k: number, open = '"${a:-\'\'', close = '}"'): string => {
  let s = 'x'
  for (let i = 0; i < k; i++) s = open + s + close
  return s
}
/** A value of 1,999 characters, and ten uses of it inside texts the same shell reads again. */
const LONG_Y = `Y=${'y'.repeat(1999)}`
const tenTimes = (f: (i: number) => string): string => many(10, f, ' ')

const CASES: Case[] = [
  { n: '1', command: "ssh rig-1.local 'ctl status'", want: pass('no-match') },
  { n: '2', command: "ssh rig-1.local 'ctl move x 10'", want: hold('site', 'rig-1.local', true) },
  { n: '3', command: 'ssh op@10.0.0.7 "cd proj && ./bench/slew-run.sh"', want: hold('site', '10.0.0.7') },
  { n: '4', command: "ssh rig-1.local 'ctl stop x'", want: pass('stop') },
  { n: '5', command: "ssh rig-1.local 'ctl stop x && ctl move x 5'", want: hold('site') },
  { n: '6', command: 'grep -n "write_register(" src/bus.py', want: pass('read-only') },
  { n: '7', command: "ssh rig-1.local 'grep -c shutdown /var/log/app.log'", want: pass('read-only') },
  { n: '8', command: PY8, want: hold('modbus-write', null) },
  {
    n: '9',
    command: "ssh rig-1.local 'cd app && .venv/bin/python - <<PY\nc.write_registers(0, [1, 2])\nPY'",
    want: hold('modbus-write', 'rig-1.local'),
  },
  { n: '10', command: "ssh rig-1.local 'sudo systemctl restart app'", want: hold('service') },
  { n: '11', command: "ssh other.example 'sudo systemctl restart app'", want: pass('no-match') },
  { n: '12', command: "ssh rig-1.local 'sudo reboot'", want: hold('power') },
  { n: '13', command: "ssh rig-1.local 'pkill -f bench'", want: hold('kill') },
  { n: '14', command: 'pkill -f vite', want: pass('no-match') },
  { n: '15a', command: "ssh rig-1.local 'gpioset gpiochip0 17=1'", want: hold('gpio-set') },
  { n: '15b', command: "ssh rig-1.local 'gpioget gpiochip0 17'", want: pass('read-only') },
  { n: '16', command: 'echo 1 > /sys/class/gpio/gpio17/value', want: hold('gpio-set') },
  { n: '17', command: 'esptool.py --port /dev/ttyUSB0 write_flash 0x0 fw.bin', want: hold('flash') },
  { n: '18', command: 'tmux send-keys -t 1 "ssh rig-1.local ctl move x 5" Enter', want: hold('site', 'rig-1.local') },
  { n: '19', command: "ssh rig-1.local 'ctl move x 5", want: hold('site', undefined, false) },
  { n: '20', command: "ssh rig-1.local 'cat > /tmp/p.py <<EOF\nc.write_register(1, 2)\nEOF'", want: hold('modbus-write') },
  { n: '21', command: 'scp fw.bin rig-1.local:/tmp/', want: pass('no-match') },
  { n: '22a', command: "ssh anywhere 'ls'", read: BROKEN, want: hold('config-error') },
  { n: '22b', command: 'ls -la', read: BROKEN, want: pass() },
  { n: '23a', command: "ssh rig-1.local 'sudo reboot'", read: NONE, want: pass() },
  { n: '23b', command: PY8, read: NONE, want: hold('modbus-write') },
  { n: '24', command: 'python3 -c "odrv0.axis0.requested_state = 8"', want: hold('motor-api') },
  // 20,007 characters of whole `echo ok; ` commands, then a real ssh call: the host and the certain read prove the ssh parse.
  { n: '25', command: `${'echo ok; '.repeat(2223)}ssh rig-1.local 'ctl home'`, want: hold('site', 'rig-1.local', true) },
  {
    n: '26',
    command: "ssh -o BatchMode=yes -o ConnectTimeout=8 -p 2222 op@rig-1.local 'ctl jog y -3'",
    want: hold('site', 'rig-1.local'),
  },
  { n: '27', command: 'for i in 1 2 3; do ssh rig-1.local "ctl move x $i"; done', want: hold('site') },
  { n: '28', command: "ssh rig-1.local 'sed -i s/a/b/ cfg && ctl status'", want: pass('no-match') },
  { n: '29', command: "ssh rig-1.local 'R=$(ls -d ~/runs/*); grep -c done $R/log'", want: pass('no-match') },
  { n: '31', command: 'cat <<EOF | ssh rig-1.local bash\nctl move x 5\nEOF', want: hold('site', 'rig-1.local') },
  { n: '32', command: "printf 'ctl move x 5\\n' | ssh rig-1.local", want: hold('site', 'rig-1.local') },
  { n: '33', command: "echo 'c.write_register(1, 2)' | python3", want: hold('modbus-write') },
  { n: '34', command: "echo 'sudo reboot' | ssh rig-1.local", want: hold('power') },
  { n: '35', command: `awk 'BEGIN{system("ctl move x 5")}'`, want: hold('site') },
  { n: '36', command: "bash <<< 'ctl move x 5'", want: hold('site') },
  { n: '37', command: "echo 'ctl move x 5' | xargs -I{} ssh rig-1.local {}", want: hold('site') },
  { n: '38', command: "ssh rig-1.local 'journalctl -u app' | grep -c shutdown", want: pass('read-only') },
  { n: '39', command: 'echo 1 | sudo tee /sys/class/gpio/gpio17/value', want: hold('gpio-set') },
  { n: '40', command: "find . -name '*.py' -execdir ctl move {} \\;", want: hold('site') },
  { n: '41', command: 'ssh rig-1.local', want: pass('no-match') },
  { n: '42', command: "ssh rig-1.local <<< 'sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '43', command: "ssh rig-1.local <<'EOF'\nsudo systemctl restart app\nEOF", want: hold('service', 'rig-1.local') },
  { n: '44', command: "ssh rig-1.local bash -s <<'EOF'\npkill -f bench\nEOF", want: hold('kill') },
  { n: '45', command: "ssh rig-1.local <<< 'grep -c shutdown log'", want: pass('read-only') },
  { n: '46', command: `awk 'BEGIN{print "sudo reboot"}' | ssh rig-1.local`, want: hold('power', 'rig-1.local') },
  { n: '47', command: `python3 -c 'print("sudo reboot")' | ssh rig-1.local`, want: hold('power', 'rig-1.local') },
  { n: '48', command: "ssh rig-1.local 'echo reboot | sudo sh'", want: hold('power', 'rig-1.local') },
  { n: '49', command: `bash -c "ssh rig-1.local 'sudo reboot'"`, want: hold('power', 'rig-1.local') },
  {
    n: '50',
    command: `ssh rig-1.local 'python3 -' <<'PY'\nimport os; os.system("reboot")\nPY`,
    want: hold('power', 'rig-1.local'),
  },
  { n: '51', command: "ssh rig-1.local 'python3 -' <<'PY'\ns.shutdown(socket.SHUT_RDWR)\nPY", want: pass('no-match') },
  { n: '52', command: "timeout 10 ssh rig-1.local 'grep -c shutdown log'", want: pass('read-only') },
  { n: '53', command: "timeout 10 ssh rig-1.local 'ctl move x 1'", want: hold('site', 'rig-1.local') },
  { n: '54', command: 'ssh rig-1.local -- ctl move x 1', want: hold('site') },
  { n: '55', command: `ssh rig-1.local "c'tl' mo\\"ve\\" x 1"`, want: hold('site') },
  { n: '56', command: "ssh rig-1.local 'ctl \\\nmove x 1'", want: hold('site') },
  { n: '57', command: "ssh rig-1.local 'ct\u200bl move x 1'", want: hold('site') },
  { n: '58', command: `ssh rig-1.local 'ctl stop "$(sudo reboot)"'`, want: hold('power') },
  { n: '59', command: 'ssh rig-1.local bash < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '60', command: 'cat run.sh | ssh rig-1.local bash', want: hold('unreadable') },
  { n: '61', command: 'echo aGk= | base64 -d | ssh rig-1.local', want: hold('unreadable') },
  { n: '62', command: 'ssh rig-1.local "$CMD"', want: hold('unreadable') },
  { n: '63', command: 'ssh other.example bash < run.sh', want: pass('no-match') },
  { n: '64', command: "echo 'ctl status' | ssh rig-1.local", want: pass('no-match') },
  { n: '65', command: 'echo G1 X10 > /dev/ttyUSB0', want: hold('serial-write') },
  {
    n: '66',
    command: `python3 - <<'PY'\np = serial.Serial("/dev/ttyUSB0")\np.write(b"M3")\nPY`,
    want: hold('serial-write'),
  },
  {
    n: '67',
    command: `curl -X POST http://rig-1.local:8080/api/move -d '{"x":1}'`,
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '68', command: 'curl -s http://rig-1.local:8080/api/status', want: pass('no-match') },
  { n: '69', command: "curl -X POST https://api.example.com/v1/things -d '{}'", want: pass('no-match') },
  { n: '70', command: "scp run.sh rig-1.local:/tmp/ && ssh rig-1.local 'bash /tmp/run.sh'", want: pass('no-match') },
  { n: '71', command: "timeout -s KILL 10 ssh rig-1.local 'grep -c done log'", want: pass('read-only') },
  { n: '72', command: "caffeinate -t 600 ssh rig-1.local 'ctl move x 1'", want: hold('site', 'rig-1.local') },
  { n: '73', command: "sudo -u op nice -n 10 ssh rig-1.local 'ctl status'", want: pass('no-match') },
  // ---- Rows 74 on: added by the review round of 2026-11-16 (one block per finding).
  // Unreadable input through a here-string, a heredoc, printf, /dev/stdin, or as the remote executable.
  { n: '74', command: 'ssh rig-1.local <<< "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '75', command: 'ssh rig-1.local bash <<< "$(cat run.sh)"', want: hold('unreadable', 'rig-1.local') },
  { n: '76', command: 'ssh rig-1.local python3 <<< "$CODE"', want: hold('unreadable', 'rig-1.local') },
  { n: '77', command: 'ssh rig-1.local <<EOF\n$(cat run.sh)\nEOF', want: hold('unreadable', 'rig-1.local') },
  { n: '78', command: 'ssh rig-1.local bash -s <<EOF\n$CMD\nEOF', want: hold('unreadable', 'rig-1.local') },
  { n: '79', command: `ssh rig-1.local 'bash -s' <<< "$(cat run.sh)"`, want: hold('unreadable', 'rig-1.local') },
  { n: '80', command: 'ssh rig-1.local bash -c "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '81', command: 'ssh rig-1.local sudo "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '82', command: 'ssh rig-1.local "cd app && $CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '83', command: 'ssh rig-1.local "$CMD 2>&1"', want: hold('unreadable', 'rig-1.local') },
  { n: '84', command: `printf '%s\\n' "$CMD" | ssh rig-1.local`, want: hold('unreadable', 'rig-1.local') },
  { n: '85', command: 'echo -n "$CMD" | ssh rig-1.local bash', want: hold('unreadable', 'rig-1.local') },
  { n: '86', command: 'cat <<< "$CMD" | ssh rig-1.local', want: hold('unreadable', 'rig-1.local') },
  { n: '87', command: 'ssh jump.example ssh rig-1.local <<< "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '88', command: "ssh rig-1.local 'python3 /dev/stdin' < s.py", want: hold('unreadable', 'rig-1.local') },
  { n: '89', command: "ssh rig-1.local 'sh /dev/stdin' < s.sh", want: hold('unreadable', 'rig-1.local') },
  // The read-only exemption ends where a command runs or writes through its own arguments.
  { n: '90', command: `ssh rig-1.local 'GIT_PAGER="sudo reboot" git log'`, want: hold('power', 'rig-1.local') },
  { n: '91', command: "GIT_EXTERNAL_DIFF='ssh rig-1.local sudo reboot' git diff", want: hold('power', 'rig-1.local') },
  { n: '92', command: "git -c core.pager='ctl move x 1' log", want: hold('site') },
  { n: '93', command: "git -c diff.external='ssh rig-1.local sudo reboot' diff", want: hold('power', 'rig-1.local') },
  { n: '94', command: "LESSOPEN='|ctl move x 1 %s' less f", want: hold('site') },
  { n: '95', command: "ssh rig-1.local 'sort -o /sys/class/gpio/gpio17/value one.txt'", want: hold('gpio-set', 'rig-1.local') },
  { n: '96', command: 'uniq g.gcode /dev/ttyUSB0', want: hold('serial-write') },
  { n: '97', command: 'git log --output=/dev/ttyUSB0', want: hold('serial-write') },
  // A case arm, a one-line function body and a parenthesised group are judged by the command that runs.
  { n: '98', command: `case "$MODE" in\n  test) ssh rig-1.local 'ctl move x 1' ;;\nesac`, want: hold('site', 'rig-1.local') },
  { n: '99', command: `case "$MODE" in true) ssh rig-1.local 'sudo reboot' ;; esac`, want: hold('power', 'rig-1.local') },
  { n: '100', command: "test() { ssh rig-1.local 'ctl move x 1'; }; test", want: hold('site', 'rig-1.local') },
  { n: '101', command: 'r() { ssh rig-1.local "$@"; }; r sudo reboot', want: hold('unreadable', 'rig-1.local') },
  { n: '102', command: 'function r { ssh rig-1.local "$@"; }; r sudo reboot', want: hold('unreadable', 'rig-1.local') },
  { n: '103', command: "(echo 'sudo reboot'; echo exit) | ssh rig-1.local", want: hold('unreadable', 'rig-1.local') },
  { n: '104', command: "ssh rig-1.local 'sudo reboot' *(N) ls", want: hold('power', 'rig-1.local') },
  { n: '105', command: `case "$MODE" in\n  status) ssh rig-1.local 'grep -c shutdown log' ;;\nesac`, want: pass('no-match') },
  // A command substitution in an unquoted heredoc body runs; zsh's =(cmd) is a substitution too.
  { n: '106', command: "cat <<EOF\nMoved: $(ssh rig-1.local 'ctl move x 10')\nEOF", want: hold('site', 'rig-1.local') },
  { n: '107', command: "grep -c ok <<EOF\n`ssh rig-1.local 'ctl home'`\nEOF", want: hold('site', 'rig-1.local') },
  { n: '108', command: 'cat <<EOF\n$(echo 1 > /sys/class/gpio/gpio17/value)\nEOF', read: NONE, want: hold('gpio-set') },
  { n: '109', command: "ssh rig-1.local 'cat <<EOF\n$(sudo reboot)\nEOF'", want: hold('power', 'rig-1.local') },
  { n: '110', command: 'cat <<EOF | ssh rig-1.local bash\n$(cat run.sh)\nEOF', want: hold('unreadable', 'rig-1.local') },
  { n: '111', command: "ls =(ssh rig-1.local 'sudo reboot')", want: hold('power', 'rig-1.local') },
  { n: '112', command: "cat <<'EOF'\nMoved: $(ssh rig-1.local 'ctl move x 10')\nEOF", want: pass('read-only') },
  // Shell and interpreter flags: what reads its program from standard input, and where the -c string is.
  { n: '113', command: "ssh rig-1.local 'bash -euo pipefail' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '114', command: "cat run.sh | ssh rig-1.local 'bash -euo pipefail'", want: hold('unreadable', 'rig-1.local') },
  { n: '115', command: "ssh rig-1.local 'python3 - x 10' < move.py", want: hold('unreadable', 'rig-1.local') },
  { n: '116', command: "ssh rig-1.local 'bash -es -- prod' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '117', command: "bash -euo pipefail -c 'ssh rig-1.local bash < run.sh'", want: hold('unreadable', 'rig-1.local') },
  { n: '118', command: `bash -euo pipefail -c "ssh rig-1.local 'grep -c shutdown log'"`, want: pass('read-only') },
  // ssh options: -o values that run a command or name the host, options after the host, -P; prefix value flags.
  { n: '119', command: "ssh -o RemoteCommand='ctl move x 1' rig-1.local", want: hold('site', 'rig-1.local') },
  { n: '120', command: "ssh -oRemoteCommand='sudo reboot' rig-1.local", want: hold('power', 'rig-1.local') },
  { n: '121', command: "ssh -o ProxyCommand='ssh rig-1.local sudo reboot' other.example ls", want: hold('power', 'rig-1.local') },
  { n: '122', command: "ssh -o HostName=rig-1.local x 'sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '123', command: 'ssh rig-1.local -T < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '124', command: 'ssh rig-1.local -tt bash < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '125', command: 'ssh rig-1.local -t "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '126', command: "ssh rig-1.local -t 'grep -c shutdown log'", want: pass('read-only') },
  { n: '127', command: "ssh -P tag rig-1.local 'cd app; sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '128', command: "exec -a ls ssh rig-1.local 'sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '129', command: "/usr/bin/time -o file ssh rig-1.local 'sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '130', command: 'env -u NAME ssh rig-1.local bash < run.sh', want: hold('unreadable', 'rig-1.local') },
  // A clobber redirect is a redirect.
  { n: '131', command: 'echo 1 >| /sys/class/gpio/gpio17/value', want: hold('gpio-set') },
  { n: '132', command: "ssh rig-1.local 'ctl status' >| /dev/ttyUSB0", want: hold('serial-write') },
  // tee, dd and pio run: no limit on what stands between the words, lines included.
  { n: '133', command: `echo 1 | sudo tee -a /tmp/${'a'.repeat(420)} /sys/class/gpio/gpio17/value`, want: hold('gpio-set') },
  { n: '134', command: `pio run --project-dir /tmp/${'a'.repeat(420)} -t upload`, want: hold('flash') },
  {
    n: '135',
    command: "python3 - <<'PY'\nimport subprocess\nsubprocess.run(['sudo', 'tee',\n  '/sys/class/gpio/gpio17/value'], input=b'1')\nPY",
    read: NONE,
    want: hold('gpio-set'),
  },
  {
    n: '136',
    command: `python3 - <<'PY'\nimport subprocess\nsubprocess.run([\n    "dd",\n    "if=frame.bin",\n    "of=/dev/ttyUSB0",\n])\nPY`,
    want: hold('serial-write'),
  },
  // A host or a base URL kept in a shell variable.
  {
    n: '137',
    command: `BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d '{"x":10}'`,
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '138', command: "H=rig-1.local; ssh $H 'bash -s' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '139', command: 'H=rig-1.local; ssh "$H" "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '140', command: `SSH="ssh rig-1.local"; $SSH 'sudo reboot'`, want: hold('power', 'rig-1.local') },
  { n: '141', command: "H=rig-1.local; ssh $H 'grep -c shutdown log'", want: pass('no-match') },
  {
    n: '142',
    command: `export HOST=rig-1.local; curl -X POST "http://\${HOST}:8080/api/move" -d '{}'`,
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '143', command: 'for h in rig-1.local 10.0.0.9; do ssh $h bash < run.sh; done', want: hold('unreadable', 'rig-1.local', false) },
  // Rule 3a inside a substitution, an eval or trap string, and text piped to a local shell.
  { n: '144', command: "OUT=$(ssh rig-1.local 'bash -s' < run.sh)", want: hold('unreadable', 'rig-1.local') },
  { n: '145', command: 'echo "$(cat run.sh | ssh rig-1.local bash)"', want: hold('unreadable', 'rig-1.local') },
  { n: '146', command: 'eval "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '147', command: 'echo "ssh rig-1.local bash < run.sh" | bash', want: hold('unreadable', 'rig-1.local') },
  { n: '148', command: 'trap "ssh rig-1.local bash < run.sh" EXIT', want: hold('unreadable', 'rig-1.local') },
  { n: '149', command: 'diff <(ssh rig-1.local bash < run.sh) expected.txt', want: hold('unreadable', 'rig-1.local') },
  // A backslash-newline joins lines only where the shell joins them.
  { n: '150', command: "# restart the rig \\\nssh rig-1.local 'sudo reboot'", want: hold('power', 'rig-1.local') },
  { n: '151', command: "echo a \\\r\nssh rig-1.local 'sudo reboot'", want: hold('power', 'rig-1.local') },
  {
    n: '152',
    command: "cat <<'EOF' > /dev/null\nnote \\\nEOF\nssh rig-1.local 'sudo reboot'\ncat <<'EOF'\nx\nEOF",
    want: hold('power', 'rig-1.local'),
  },
  {
    n: '153',
    command: "cd /tmp && \\\n# restart the app \\\nssh rig-1.local 'sudo systemctl restart app'",
    want: hold('service', 'rig-1.local'),
  },
  // The body is an interpreter's code only when the interpreter is what reads standard input.
  { n: '154', command: "ssh rig-1.local 'python3 prep.py; bash' <<'EOF'\nsudo reboot\nEOF", want: hold('power', 'rig-1.local') },
  { n: '155', command: "ssh rig-1.local 'node -v; sh' <<< 'pkill -f bench'", want: hold('kill', 'rig-1.local') },
  // A command too long to take apart that names a configured host.
  {
    n: '156',
    command: `${'echo ok; '.repeat(50_000)}ssh rig-1.local bash < run.sh`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  // wget -T is a timeout.
  { n: '157', command: 'wget -T 5 http://rig-1.local:8080/api/status', want: pass('no-match') },
  { n: '158', command: "ssh rig-1.local 'wget -q -T 5 -O- http://localhost:8080/api/status'", want: pass('no-match') },
  // Everyday spellings of three table patterns.
  { n: '159', command: 'echo G1 X10 > /dev/tty.usbmodem14101', want: hold('serial-write') },
  { n: '160', command: 'python3 -c "axis.controller.input_pos += 1"', want: hold('motor-api') },
  { n: '161', command: 'pio run --target=upload', want: hold('flash') },
  // Signal 0 only asks whether a process exists.
  { n: '162', command: "ssh rig-1.local 'while kill -0 2186 2>/dev/null; do sleep 5; done; echo done'", want: pass('no-match') },
  { n: '163', command: "ssh rig-1.local 'kill -0 2186 && kill 2186'", want: hold('kill', 'rig-1.local') },
  { n: '164', command: "ssh rig-1.local 'kill -s 0 2186'", want: pass('no-match') },
  { n: '165', command: "ssh rig-1.local 'kill -9 2186'", want: hold('kill', 'rig-1.local') },
  // ---- Rows 166 on: added by the second review round of 2026-11-16 (one block per finding).
  // A substitution inside ${...} inside double quotes runs like any other.
  { n: '166', command: "echo \"${OUT:-$(ssh rig-1.local 'ctl move x 1')}\"", want: hold('site', 'rig-1.local') },
  { n: '167', command: "test -n \"${OUT:=$(ssh rig-1.local 'ctl move x 1')}\" && echo moved", want: hold('site', 'rig-1.local') },
  { n: '168', command: "ssh rig-1.local 'echo \"${OUT:-$(sudo reboot)}\"'", want: hold('power', 'rig-1.local') },
  { n: '169', command: "echo \"${OUT:-`ssh rig-1.local 'ctl move x 1'`}\"", want: hold('site', 'rig-1.local') },
  { n: '170', command: "echo \"${X:+$(ssh rig-1.local 'ctl move x 1')}\"", want: hold('site', 'rig-1.local') },
  { n: '171', command: "echo \"${arr[$(ssh rig-1.local 'ctl move x 1')]}\"", want: hold('site', 'rig-1.local') },
  { n: '172', command: 'X="${X:-$(ssh rig-1.local bash < run.sh)}"', want: hold('unreadable', 'rig-1.local') },
  { n: '173', command: "ssh rig-1.local 'ctl stop \"${X:-$(sudo reboot)}\"'", want: hold('power', 'rig-1.local') },
  { n: '174', command: 'echo "${V:-$(echo 1 > /sys/class/gpio/gpio17/value)}"', want: hold('gpio-set', null) },
  { n: '175', command: "[ \"${RESULT:=$(ssh rig-1.local 'ctl home')}\" = ok ] && echo homed", want: hold('site', 'rig-1.local') },
  {
    n: '176',
    command: "echo \"${OUT:-$(ssh rig-1.local 'ctl move x 1' | awk '{print $1}')}\"",
    want: hold('site', 'rig-1.local', true),
  },
  // A `)` glued into a word is part of the word; a group before `then`, `do`, `done` or `}` is a command of its own.
  { n: '177', command: "ssh rig-1.local 'bash -s' < run.sh *(N) ls", want: hold('unreadable', 'rig-1.local') },
  { n: '178', command: 'ssh rig-1.local bash -s *(N) x < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '179', command: 'ssh rig-1.local bash -s < run.sh x(N) y', want: hold('unreadable', 'rig-1.local') },
  { n: '180', command: 'ssh rig-1.local bash -s < run.sh !(x) y', want: hold('unreadable', 'rig-1.local') },
  { n: '181', command: "cat run.sh | ssh rig-1.local 'bash -s' *(N) x", want: hold('unreadable', 'rig-1.local') },
  { n: '182', command: "if (echo 'ctl move x 1' | ssh rig-1.local bash) then echo ok; fi", want: hold('site', 'rig-1.local') },
  { n: '183', command: "if (ssh rig-1.local 'bash -s' < run.sh) then echo ok; fi", want: hold('unreadable', 'rig-1.local') },
  { n: '184', command: 'for i in 1 2; do (cat run.sh | ssh rig-1.local bash -s) done', want: hold('unreadable', 'rig-1.local') },
  { n: '185', command: "ssh rig-1.local '{ (bash -s) }' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '186', command: "if (ssh rig-1.local bash <<'EOF') then echo ok; fi\nctl move x 1\nEOF", want: hold('site', 'rig-1.local') },
  { n: '187', command: "if (ssh rig-1.local <<'EOF') then echo ok; fi\nsudo reboot\nEOF", want: hold('power', 'rig-1.local') },
  // An internal error, or nesting too deep to follow, never passes a text that names a configured host.
  {
    n: '188',
    command: `ssh rig-1.local bash < run.sh; ${'"$('.repeat(5000)}${')"'.repeat(5000)}`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '189',
    command: `ssh rig-1.local bash < run.sh; ${'"$('.repeat(20_000)}${')"'.repeat(20_000)}`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  { n: '190', command: `ssh rig-1.local "$CMD"; echo ${'"$('.repeat(20_000)}`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '191', command: `cat run.sh | ssh rig-1.local bash; echo ${'"$('.repeat(20_000)}`, want: hold('unreadable', 'rig-1.local', false) },
  {
    n: '192',
    command: `ssh rig-1.local "$CMD"; echo ${'"$('.repeat(16_000)}${')"'.repeat(16_000)}`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '193',
    command: `ssh rig-1.local bash < run.sh; bash -n -c '${'"$('.repeat(20_000)}'`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  { n: '194', command: `ssh rig-1.local '${'$A;'.repeat(125_000)}'`, want: hold('unreadable', 'rig-1.local') },
  // A carried value is in place inside a substitution, a process substitution and an eval or trap string.
  {
    n: '195',
    command: `BASE=http://rig-1.local:8080; RESP=$(curl -s -X POST "$BASE/api/move" -d '{"x":10}'); echo "$RESP"`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '196',
    command: 'BASE=http://rig-1.local:8080; RESP=`curl -s -X POST "$BASE/api/move" -d 1`; echo "$RESP"',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '197',
    command: 'BASE=http://rig-1.local:8080; echo "answer: $(curl -s -X POST "$BASE/api/move" -d 1)"',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '198',
    command: `BASE=http://rig-1.local:8080; if [ "$(curl -s -o /dev/null -X POST "$BASE/api/move" -d 1)" = 200 ]; then echo ok; fi`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '199',
    command: 'BASE=http://rig-1.local:8080; diff <(curl -s -X POST "$BASE/api/move" -d 1) expected.json',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '200',
    command: "export HOST=rig-1.local; CODE=$(curl -X POST \"http://${HOST}:8080/api/move\" -d '{}')",
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '201',
    command: `BASE=http://rig-1.local:8080\nRESP=$(curl -s -X POST "$BASE/api/move" -d '{"x":10}')\necho "$RESP"`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '202',
    command: 'BASE=http://rig-1.local:8080; ID=$(curl -s -X POST "$BASE/api/jobs" -d 1 | jq -r .id)',
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '203', command: `SSH="ssh rig-1.local"; OUT=$($SSH 'sudo reboot')`, want: hold('power', 'rig-1.local') },
  { n: '204', command: `SSH="ssh rig-1.local"; OUT=$($SSH 'sudo systemctl restart app')`, want: hold('service', 'rig-1.local') },
  { n: '205', command: `SSH="ssh rig-1.local"; OUT=$($SSH 'pkill -f bench')`, want: hold('kill', 'rig-1.local') },
  { n: '206', command: `SSH="ssh rig-1.local"; OUT=$($SSH 'bash -s' < run.sh)`, want: hold('unreadable', 'rig-1.local') },
  { n: '207', command: 'RIG=rig-1.local; X=$(docker -H "tcp://$RIG:2375" restart app)', want: hold('service', 'rig-1.local') },
  {
    n: '208',
    command: `BASE=http://rig-1.local:8080; eval 'curl -s -X POST "$BASE/api/move" -d 1'`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '209',
    command: `BASE=http://rig-1.local:8080; trap 'curl -s -X POST "$BASE/api/move" -d 1' EXIT`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '210',
    command: `H=rig-1.local; curl -H 'Content-Type: application/json' -X POST "http://$H:8080/api/move" -d '{}'`,
    want: hold('http-write', 'rig-1.local'),
  },
  // A backslash-newline after a redirect operator, inside $'...', after `$`, and between `<` and `(`.
  { n: '211', command: 'ssh rig-1.local bash < \\\n  run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '212', command: 'cat run.sh | ssh rig-1.local bash > \\\n  /dev/null', want: hold('unreadable', 'rig-1.local') },
  { n: '213', command: 'cat run.sh | ssh rig-1.local bash &> \\\n  out.log', want: hold('unreadable', 'rig-1.local') },
  { n: '214', command: 'ssh rig-1.local bash 2> \\\n  /dev/null < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '215', command: "ssh rig-1.local $'ctl mo\\\nve x 1'", want: hold('site', 'rig-1.local') },
  { n: '216', command: "echo $\\\n(ssh rig-1.local 'sudo reboot')", want: hold('power', 'rig-1.local') },
  { n: '217', command: 'ssh rig-1.local bash < <(cat run.sh)', want: hold('unreadable', 'rig-1.local') },
  { n: '218', command: 'cat run.sh | ssh rig-1.local bash >> \\\n  out.log', want: hold('unreadable', 'rig-1.local') },
  { n: '219', command: 'ssh rig-1.local <<< \\\n  "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '220', command: 'ssh rig-1.local bash << \\\n  EOF\n$CMD\nEOF', want: hold('unreadable', 'rig-1.local') },
  { n: '221', command: 'diff <\\\n(ssh rig-1.local bash < run.sh) expected.txt', want: hold('unreadable', 'rig-1.local') },
  // An assignment behind `{`, `then`, `do`, a case pattern or a function's brace, or made with local, declare, typeset or readonly.
  {
    n: '222',
    command: `f() { BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d '{"x":10}'; }; f`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '223',
    command: '{ BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; }',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '224',
    command: 'if true; then BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; fi',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '225',
    command: 'for x in 1 2; do BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; done',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '226',
    command: 'case "$1" in go) BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 ;; esac',
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '227', command: '{ DEV=/dev/ttyUSB0; echo G1 X10 > "$DEV"; }', want: hold('serial-write', null) },
  {
    n: '228',
    command: 'local BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '229',
    command: 'move() {\n  local BASE=http://rig-1.local:8080\n  curl -s -X POST "$BASE/api/move" -d 1\n}\nmove',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '230',
    command: 'case "$1" in\n  go) BASE=http://rig-1.local:8080\n    curl -s -X POST "$BASE/api/move" -d 1 ;;\nesac',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '231',
    command: 'readonly BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '232',
    command: 'declare BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '233',
    command: 'declare -r BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '234',
    command: 'typeset BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1',
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '235',
    command: 'while read -r line; do BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move" -d "$line"; done < moves.txt',
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '236', command: '{ PIN=/sys/class/gpio/gpio17/value; echo 1 | sudo tee "$PIN"; }', want: hold('gpio-set', null) },
  { n: '237', command: `{ SSH="ssh rig-1.local"; $SSH 'sudo reboot'; }`, want: hold('power', 'rig-1.local') },
  { n: '238', command: '{ RUN="ssh rig-1.local"; $RUN bash < run.sh; }', want: hold('unreadable', 'rig-1.local') },
  // A shell's long options written with one dash, and zsh's glued -o: the -c string is still found.
  { n: '239', command: 'bash -login -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '240', command: 'bash -noprofile -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '241', command: 'bash -posix -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '242', command: 'zsh -oshwordsplit -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '243', command: `bash -login -c "ssh rig-1.local 'grep -c shutdown log'"`, want: pass('read-only') },
  { n: '244', command: 'bash -verbose -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '245', command: 'bash -noediting -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '246', command: 'bash -restricted -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '247', command: 'bash -rcfile F -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '248', command: 'bash -init-file F -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '249', command: 'bash -noprofile -norc -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '250', command: 'sh -login -c "ssh rig-1.local bash < run.sh"', want: hold('unreadable', 'rig-1.local') },
  { n: '251', command: 'ssh rig-1.local bash -login -c "$CMD"', want: hold('unreadable', 'rig-1.local') },
  { n: '252', command: `bash -login -c 'ssh rig-1.local "ctl stop $(sudo reboot)"'`, want: hold('power', 'rig-1.local') },
  // A signal option after signal 0 makes it a real kill.
  { n: '253', command: "ssh rig-1.local 'kill -0 -s KILL 2186'", want: hold('kill', 'rig-1.local') },
  { n: '254', command: "ssh rig-1.local 'kill -s 0 -s 9 2186'", want: hold('kill', 'rig-1.local') },
  { n: '255', command: "ssh rig-1.local 'pkill -0 --signal KILL -f bench'", want: hold('kill', 'rig-1.local') },
  { n: '256', command: "ssh rig-1.local 'pkill -0 -f bench --signal 9'", want: hold('kill', 'rig-1.local') },
  { n: '257', command: "ssh rig-1.local 'killall -0 bench -s KILL'", want: hold('kill', 'rig-1.local') },
  { n: '258', command: "ssh rig-1.local 'kill -0 2186'", want: pass('no-match') },
  { n: '259', command: "ssh rig-1.local 'kill -0 -- -2186'", want: pass('no-match') },
  // ---- The third review round of 2026-11-16 (rows 260 on).
  // The 64 second readings spent: the raw command decides, and one that names a configured host is held.
  {
    n: '260',
    command: `${many(70, i => `n${i}=$(ls /tmp/f${i}*(N) | wc -l)`)}\nf() ( case $1 in a) ssh rig-1.local bash < run.sh;; esac )`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  { n: '261', command: `${arith(64)}; time (ssh rig-1.local bash) < run.sh`, want: hold('unreadable', 'rig-1.local') },
  { n: '262', command: `time (ssh rig-1.local bash) < run.sh; ${nestedDefaults(7)}`, want: hold('unreadable', 'rig-1.local') },
  { n: '263', command: `f() (ssh rig-1.local bash) < run.sh; f; ${nestedDefaults(7)}`, want: hold('unreadable', 'rig-1.local') },
  { n: '264', command: `time (ssh rig-1.local bash) <<< "$CMD"; ${nestedDefaults(7)}`, want: hold('unreadable', 'rig-1.local') },
  { n: '265', command: `${arith(70)}; ssh rig-1.local $'echo a \\\nbash' < run.sh`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '266', command: `${arith(70)}; CMD='grep -c done log'; ssh rig-1.local "$CMD"`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '267', command: `${arith(70)}; ls -la`, want: pass() },
  // The room for carried values spent: no later use is quietly read as an unknown variable.
  {
    n: '268',
    command: `B=http://rig-1.local:8080/${'v'.repeat(1900)}; X=$(echo ${tenTimes(() => '"$B"')}); curl -X POST "$B" -d 1`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '269',
    command: `B=http://rig-1.local:8080; X=$(printf '%s\\n' ${many(900, () => '"$B"', ' ')}); curl -X POST "$B/api/move" -d 1`,
    want: hold('http-write', 'rig-1.local', false),
  },
  {
    n: '270',
    command: `${LONG_Y}; echo ${tenTimes(i => `$(echo $Y ${i})`)}; DEV=/dev/ttyUSB0; echo G1 X10 > "$DEV"`,
    want: hold('serial-write', null),
  },
  {
    n: '271',
    command: `${LONG_Y}; echo ${tenTimes(i => `$(echo $Y ${i})`)}; SSH="ssh rig-1.local"; $SSH bash < run.sh`,
    want: hold('unreadable', 'rig-1.local'),
  },
  {
    n: '272',
    command: `${LONG_Y}; ${many(10, i => `eval 'echo $Y ${i}'`, '; ')}; BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1`,
    want: hold('http-write', 'rig-1.local'),
  },
  {
    n: '273',
    command: `${LONG_Y}; ${many(10, i => `trap 'echo $Y ${i}' EXIT`, '; ')}; SSH="ssh rig-1.local"; $SSH 'sudo reboot'`,
    want: hold('power', 'rig-1.local'),
  },
  {
    n: '274',
    command: `B=http://rig-1.local:8080; echo ${many(1000, () => '"$B"', ' ')}; curl -X POST "$B/api/move" -d 1`,
    want: hold('http-write', 'rig-1.local', false),
  },
  // A closed nest past the levels the reader follows is a limit, not an unclosed quote: what stands after it is not lost.
  { n: '275', command: `${quotedNest(101)}\nssh rig-1.local bash < run.sh`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '276', command: `${quotedNest(105)}; ssh rig-1.local "$CMD"`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '277', command: `${quotedNest(107)}; cat run.sh | ssh rig-1.local bash`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '278', command: `echo ${braceNest(102)}; ssh rig-1.local bash < run.sh`, want: hold('unreadable', 'rig-1.local', false) },
  { n: '279', command: `${quotedNest(101)}\nls`, want: pass() },
  // A subshell behind `time`, behind a function's `()` and in a later case arm is a group, read like any other.
  { n: '280', command: "time (ssh rig-1.local 'grep -c shutdown log')", want: pass('read-only') },
  { n: '281', command: "time (ssh rig-1.local 'cat /var/log/reboot.log' | wc -l)", want: pass('read-only') },
  { n: '282', command: "ssh rig-1.local 'time (grep -c shutdown /var/log/syslog)'", want: pass('read-only') },
  { n: '283', command: "f() (ssh rig-1.local 'grep -c shutdown log'); f", want: pass() },
  { n: '284', command: `case "$1" in a) echo a ;; b) (ssh rig-1.local 'grep -c shutdown log') ;; esac`, want: pass() },
  { n: '285', command: 'time (ssh rig-1.local bash) < run.sh', want: hold('unreadable', 'rig-1.local') },
  { n: '286', command: 'f() (ssh rig-1.local bash) < run.sh; f', want: hold('unreadable', 'rig-1.local') },
  { n: '287', command: 'case $1 in a) echo hi ;; b) (ssh rig-1.local bash) < run.sh ;; esac', want: hold('unreadable', 'rig-1.local') },
  { n: '288', command: 'f() ( case $1 in a) ssh rig-1.local bash < run.sh;; esac )', want: hold('unreadable', 'rig-1.local') },
  { n: '289', command: "ssh rig-1.local '{ time (bash -s) }' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '290', command: "ssh rig-1.local 'for i in 1; do time (bash -s) done' < run.sh", want: hold('unreadable', 'rig-1.local') },
  { n: '291', command: "time -p (ssh rig-1.local 'grep -c shutdown log')", want: pass('read-only') },
  { n: '292', command: 'ls (a|b)*', want: pass() },
  // A weak value never takes a hold away: a target known only through one stays an unresolved target (rule 3a).
  {
    n: '293',
    command: 'if [ -n "$S" ]; then H=other.example; fi; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '294',
    command: 'f() { local H=other.example; }; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '295',
    command: 'case x in a) H=other.example ;; esac; ssh "$H" "$CMD"; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '296',
    command: 'while false; do H=other.example; done; cat run.sh | ssh ${H} bash; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '297',
    command: "curl -H 'X: 1' http://x.example; H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local",
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '298',
    command: 'if [ "$MODE" = spare ]; then H=spare.example; fi; : "${H:=rig-1.local}"; ssh $H bash < run.sh',
    want: hold('unreadable', 'rig-1.local', false),
  },
  { n: '299', command: 'H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local', want: pass() },
  // A bare name behind a declaring word is no second assignment: the value is carried, as a weak one.
  {
    n: '300',
    command: 'f() {\n  local url\n  url=http://rig-1.local:8080/api/move\n  curl -X POST "$url" -d 1\n}\nf',
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '301', command: 'local B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1', want: hold('http-write', 'rig-1.local') },
  { n: '302', command: 'export B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1', want: hold('http-write', 'rig-1.local') },
  { n: '303', command: 'B=http://rig-1.local:8080; export B; curl -X POST "$B/api/move" -d 1', want: hold('http-write', 'rig-1.local') },
  {
    n: '304',
    command: 'local H; H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  // A value the one-use guard declined is carried as a weak one, and a value put together from a weak one is weak.
  {
    n: '319',
    command: 'URL=http://rig-1.local:8080/api/move; curl -X POST "$URL" -d 1; echo URL done',
    want: hold('http-write', 'rig-1.local'),
  },
  { n: '320', command: 'dev=/dev/ttyUSB0; echo G1 X10 > "$dev"', want: hold('serial-write', null) },
  {
    n: '321',
    command: '{ A=other.example; }; H=$A; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  {
    n: '322',
    command: 'H=other.example; echo H; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    want: hold('unreadable', 'rig-1.local', false),
  },
  // Signal 0: a later signal option is seen behind a clobber redirect and behind a quoted separator.
  { n: '305', command: "ssh rig-1.local 'kill -0 >| /tmp/out -s KILL 2186'", want: hold('kill', 'rig-1.local') },
  { n: '306', command: 'ssh rig-1.local "kill -0 2186 2>| /dev/null -s KILL"', want: hold('kill', 'rig-1.local') },
  { n: '307', command: "ssh rig-1.local 'pkill -0 -f bench >| /dev/null --signal 9'", want: hold('kill', 'rig-1.local') },
  { n: '308', command: `ssh rig-1.local 'pkill -0 "bench|runner" --signal 9'`, want: hold('kill', 'rig-1.local') },
  { n: '309', command: "ssh rig-1.local 'kill -0 2186 >| /dev/null'", want: pass('no-match') },
  // A process substitution inside the braces of a reference, and the command form `${ command; }`.
  { n: '310', command: `cat \${A:-<(ssh rig-1.local 'ctl move x 1')}`, want: hold('site', 'rig-1.local') },
  { n: '311', command: "ssh rig-1.local 'cat ${F:-<(sudo reboot)}'", want: hold('power', 'rig-1.local') },
  { n: '312', command: "bash -c 'cat ${F:-<(ssh rig-1.local bash < run.sh)}'", want: hold('unreadable', 'rig-1.local') },
  { n: '313', command: `ssh rig-1.local 'echo "\${ sudo reboot; }"'`, want: hold('power', 'rig-1.local') },
  { n: '314', command: "ssh rig-1.local 'echo ${| sudo reboot; }'", want: hold('power', 'rig-1.local') },
  { n: '315', command: 'cat ${F:-/dev/null}', want: pass('read-only') },
  // The reader's other limits end the same way (the full list is tried in a test below).
  {
    n: '316',
    command: `B=http://rig-1.local:8080/${'v'.repeat(2001)}; curl -X POST "$B" -d 1`,
    want: hold('unreadable', 'rig-1.local', false),
  },
  { n: '317', command: `echo ${quoteInBraces(40)}; ssh rig-1.local 'grep -c done log'`, want: hold('unreadable', 'rig-1.local', false) },
  {
    n: '318',
    command: `ssh rig-1.local 'docker compose --project-directory /srv/${'a'.repeat(300)} up -d'`,
    want: hold('service', 'rig-1.local'),
  },
]

const kindsOf = (v: Verdict): string[] => (v.hold ? v.reasons.map(r => r.kind) : [])

for (const c of CASES) {
  const label = c.command.length > 70 ? `${c.command.slice(0, 67).replace(/\n/g, ' / ')}...` : c.command.replace(/\n/g, ' / ')
  test(`match ${c.n}: ${label}`, async () => {
    const v = classify(c.command, c.read ?? OK)
    if (c.want.hold) {
      expect(v.hold, `verdict ${JSON.stringify(v)}`).toBe(true)
      if (!v.hold) return
      expect(kindsOf(v)).toContain(c.want.kind)
      if (c.want.host !== undefined) expect(v.host).toBe(c.want.host)
      expect(v.isCertain).toBe(c.want.isCertain ?? true)
      expect(v.summary.length).toBeGreaterThan(0)
    } else {
      expect(v.hold, `verdict ${JSON.stringify(v)}`).toBe(false)
      if (v.hold) return
      if (c.want.why) expect(v.why).toBe(c.want.why)
    }
  })
}

test('match 30: a command holding U+0000 and U+009B gives a verdict and does not throw', async () => {
  const v = classify("echo a\u0000b; ssh rig-1.local 'ctl\u009b status' \u0000", OK)
  expect(typeof v.hold).toBe('boolean')
  const held = classify("ssh rig-1.local 'ctl move\u0000 x\u009b 1'", OK)
  expect(held.hold).toBe(true)
})

test('match: the example config reads ok, with its hosts, patterns and stop command', async () => {
  expect(OK.status).toBe('ok')
  if (OK.status !== 'ok') return
  expect(OK.config.hosts).toEqual(['rig-1.local', '10.0.0.*'])
  expect(OK.config.hold).toHaveLength(2)
  expect(OK.config.stop).toHaveLength(1)
  expect(OK.config.stopCommand).toEqual(['ssh', '{host}', 'ctl stop all'])
  expect(OK.warnings).toEqual([])
})

test('match: parseConfig reads none, broken and a warning', async () => {
  expect(parseConfig(null)).toEqual({ status: 'none' })
  expect(parseConfig('{').status).toBe('broken')
  const bad = parseConfig('{"hold":["("]}')
  expect(bad.status).toBe('broken')
  if (bad.status === 'broken') expect(bad.error).toContain('"("')
  const extra = parseConfig('{"extra":1}')
  expect(extra.status).toBe('ok')
  if (extra.status === 'ok') {
    expect(extra.warnings).toHaveLength(1)
    expect(extra.warnings[0]).toContain('extra')
    expect(extra.config).toEqual({ hosts: [], hold: [], stop: [], stopCommand: null })
  }
})

test('match: parseConfig refuses a wrong type and a pattern that matches everything', async () => {
  for (const text of [
    '[]',
    '"x"',
    'null',
    '{"hosts":"rig-1.local"}',
    '{"hosts":[1]}',
    '{"hosts":[""]}',
    '{"hold":"ctl"}',
    '{"hold":[""]}',
    '{"stop":["x*"]}',
    '{"stop":[7]}',
    '{"stopCommand":"ctl stop"}',
    '{"stopCommand":[]}',
    '{"stopCommand":["ssh",1]}',
  ]) {
    expect(parseConfig(text).status, text).toBe('broken')
  }
  const none = parseConfig('{"stopCommand":null}')
  expect(none.status).toBe('ok')
})

test('match: hostOf finds a configured host in a word, a user@ form, a URL and a remote path', async () => {
  expect(hostOf('ssh op@RIG-1.local ls', ['rig-1.local'])).toBe('RIG-1.local')
  expect(hostOf('ssh op@10.0.0.7 ls', ['rig-1.local', '10.0.0.*'])).toBe('10.0.0.7')
  expect(hostOf('curl http://rig-1.local:8080/api/status', ['rig-1.local'])).toBe('rig-1.local')
  expect(hostOf('curl "https://op:pw@rig-1.local/x?y=1"', ['rig-1.local'])).toBe('rig-1.local')
  expect(hostOf('scp fw.bin rig-1.local:/tmp/', ['rig-1.local'])).toBe('rig-1.local')
  expect(hostOf('tmux send-keys "ssh rig-1.local ls" Enter', ['rig-1.local'])).toBe('rig-1.local')
  expect(hostOf('ssh rig-123local ls', ['rig-1?local'])).toBeNull()
  expect(hostOf('ssh rig-1xlocal ls', ['rig-1?local'])).toBe('rig-1xlocal')
  expect(hostOf('ssh other.example ls', ['rig-1.local'])).toBeNull()
  expect(hostOf('ssh rig-1.local.example ls', ['rig-1.local'])).toBeNull()
  expect(hostOf('ssh rig-1.local ls', [])).toBeNull()
})

test('match: clean drops control characters and cuts', async () => {
  expect(clean('a\u0000b\u009bc', 10)).toBe('abc')
  expect(clean('a\tb\nc\u007f', 10)).toBe('a\tb\nc')
  expect(clean('abcdefghij', 4)).toHaveLength(4)
})

test('match: the summary names each kind once, in the fixed order, with the host', async () => {
  const v = classify("ssh rig-1.local 'sudo reboot; ctl move x 1; pkill -f a; sudo reboot'", OK)
  expect(v.hold).toBe(true)
  if (!v.hold) return
  expect(v.summary).toBe('run a site motion command, reboot or power off, kill a process on rig-1.local')
  const local = classify(PY8, OK)
  if (local.hold) expect(local.summary).toBe('write Modbus registers')
  const broken = classify("ssh anywhere 'ls'", BROKEN)
  if (broken.hold) expect(broken.summary).toContain('use hardware while the site config is broken')
  const unreadable = classify('ssh rig-1.local bash < run.sh', OK)
  if (unreadable.hold) expect(unreadable.summary).toBe('run input that cannot be read on rig-1.local')
})

test('match: every reason carries a cleaned match and the host of its segment', async () => {
  const v = classify("ssh rig-1.local 'ctl move x 10'", OK)
  expect(v.hold).toBe(true)
  if (!v.hold) return
  expect(v.reasons).toEqual([{ kind: 'site', match: 'ctl move', host: 'rig-1.local' }])
})

test('match: an uncertain parse tries every pattern on the raw text (rule 7)', async () => {
  // An unclosed heredoc, an unclosed substitution, a remote shell with no target.
  for (const command of [
    'cat <<EOF | ssh rig-1.local bash\nctl move x 5',
    'echo "$(ssh rig-1.local ctl move x 5',
    "ssh -v; echo rig-1.local 'sudo reboot",
  ]) {
    const v = classify(command, OK)
    expect(v.hold, command).toBe(true)
    if (v.hold) expect(v.isCertain, command).toBe(false)
  }
  // Uncertain and nothing matches: it passes.
  expect(classify('echo "it is fine', OK).hold).toBe(false)
  // A variable as the target: the host is not known, so the raw text decides.
  const loop = classify("for h in rig-1.local 10.0.0.9; do ssh $h 'sudo reboot'; done", OK)
  expect(loop.hold).toBe(true)
  if (loop.hold) expect(kindsOf(loop)).toContain('power')
  expect(classify("ssh $H 'ls'", OK).hold).toBe(false)
})

test('match: a comment hides nothing and exempts nothing', async () => {
  // An apostrophe in a comment must not swallow the next line as a quoted word.
  const v = classify("echo a # it's\nssh rig-1.local 'ctl move x 1' # it's", OK)
  expect(v.hold).toBe(true)
  // A hold word in a comment is still tried; a plain comment changes nothing.
  expect(classify('ls -la # then ctl move x 5 by hand', OK).hold).toBe(true)
  const plain = classify('ls -la # list the files', OK)
  expect(plain).toEqual({ hold: false, why: 'read-only' })
  // A stop word in a comment exempts nothing.
  const stop = classify("ssh rig-1.local 'sudo reboot # ctl stop'", OK)
  expect(stop.hold).toBe(true)
})

test('match: quoting, grouping and wrappers do not hide a held command', async () => {
  const held = [
    "(cd /tmp && ssh rig-1.local 'ctl move x 1')",
    "{ ssh rig-1.local 'ctl move x 1'; }",
    "if ssh rig-1.local 'ctl move x 1'; then echo ok; fi",
    "while ! ssh rig-1.local 'sudo reboot'; do sleep 1; done",
    "X=1 env Y=2 nohup ssh -tt rig-1.local 'ctl home' &",
    'ssh rig-1.local ctl\\ move x 1',
    "ssh rig-1.local $'ctl move x 1'",
    "ssh -tp 2222 rig-1.local 'ctl move x 1'",
    "mosh rig-1.local -- sh -c 'ctl move x 1'",
    "ssh other.example \"ssh rig-1.local 'sudo reboot'\"",
    "sh -c 'sudo sh -c \"ssh rig-1.local reboot\"'",
    "watch -n 1 ssh rig-1.local 'ctl move x 1'",
    "docker exec box bash -c \"ssh rig-1.local 'sudo reboot'\"",
    "echo $(ssh rig-1.local 'sudo reboot')",
    "OUT=`ssh rig-1.local 'ctl move x 1'`",
    "arr=(echo) ; ssh rig-1.local 'ctl move x 1'",
    "ssh rig-1.local 'ls' && ssh rig-1.local 'ctl drive 3'",
    "ssh rig-1.local 'tail -n 5 log > /tmp/out; systemctl stop app'",
    'python3 -c \'import subprocess; subprocess.run(["ssh", "rig-1.local", "sudo reboot"])\'',
    "node -e 'require(\"child_process\").execSync(\"ssh rig-1.local ctl move x 1\")'",
    "ssh rig-1.local 'echo ctl move x 1' | ssh rig-1.local",
    "ssh rig-1.local 'cat /tmp/cmd' | bash; ssh rig-1.local \"$(cat cmd.txt)\"",
    "cat <<'EOF' | ssh rig-1.local\nsudo systemctl restart app\nEOF",
    'echo "$CMD" | ssh rig-1.local bash',
    "ssh rig-1.local 'cd app && bash' < run.sh",
    "http POST rig-1.local/api/move x=1",
    "wget --post-data 'x=1' http://rig-1.local/api/move",
    "ssh rig-1.local 'echo 1 | sudo tee /sys/class/gpio/gpio4/value'",
    "ssh rig-1.local 'dd if=fw.bin of=/dev/ttyACM0'",
    'pio run -e board -t upload',
    "sshpass -p x ssh rig-1.local 'sudo reboot'",
    "ssh rig-1.local 'docker-compose restart'",
    "ssh rig-1.local 'docker compose -f a.yml up -d'",
    "ssh rig-1.local 'sudo systemctl --user restart app'",
    "ssh rig-1.local 'sudo systemctl try-restart app'",
    "ssh rig-1.local 'sudo service app restart'",
    "ssh rig-1.local 'docker container stop app'",
    'docker -H ssh://rig-1.local restart app',
    'systemctl -H rig-1.local reboot',
    'curl -s -XPOST http://rig-1.local:8080/api/move',
    'curl -sT fw.bin http://rig-1.local:8080/api/firmware',
    "ssh rig-1.local 'sudo -i' < run.sh",
    'ssh jump.example ssh rig-1.local bash < run.sh',
    'cat run.sh | ssh jump.example ssh rig-1.local',
    'ssh jump.example ssh rig-1.local \'"$CMD"\'',
    "cat run.sh | ssh rig-1.local 'sudo su -'",
    "ssh rig-1.local 'bash -s' < <(echo \"ctl move x 1\")",
    "ssh rig-1.local -t 'sudo reboot'",
    "ssh rig-1.local 'echo G1' > /dev/ttyUSB0",
    "eval \"ssh rig-1.local 'sudo reboot'\"",
    "bash -c 'for h in rig-1.local; do ssh \"$h\" sudo reboot; done'",
    "ssh\trig-1.local\t'sudo reboot'\r\n",
    "ssh rig-1.local <<-EOF\n\tctl move x 1\n\tEOF",
    "ssh rig-1.local <<EOF &\nsudo reboot\nEOF",
    "tmux send-keys -t 1 'ssh rig-1.local ctl stop x; sudo reboot' Enter",
    'rg --pre "ctl move" x .',
  ]
  for (const command of held) expect(classify(command, OK).hold, command).toBe(true)
})

test('match: reads, logs and status pass, on a configured host too', async () => {
  const passed = [
    "ssh rig-1.local 'systemctl status app'",
    "ssh rig-1.local 'journalctl -u app -n 50 --no-pager'",
    "ssh rig-1.local 'tail -n 100 /var/log/shutdown.log' 2>/dev/null",
    "ssh rig-1.local 'ps aux | grep -c kill'",
    "ssh rig-1.local 'cd app && git log --oneline -5'",
    "ssh rig-1.local 'git -C app status'",
    "ssh rig-1.local 'cat /sys/class/gpio/gpio17/value'",
    "ssh rig-1.local 'ls -la; df -h; uptime' 2>&1",
    'ping -c 1 rig-1.local',
    'rsync -a rig-1.local:/var/log/app/ ./logs/',
    'git log --grep "ctl move" --oneline',
    'kill 1234; killall node',
    'sudo systemctl restart nginx',
    'curl -X POST https://api.example.com/v1/reboot -d "{}"',
    "python3 -c 'proc.kill(); sock.shutdown(2)'",
    "if ssh rig-1.local 'grep -q shutdown log'; then echo found; fi",
    'echo done',
    "ssh rig-1.local 'docker compose ps'",
    "ssh rig-1.local 'docker compose logs --tail 5 startup'",
    "ssh rig-1.local 'docker ps'",
    "ssh rig-1.local 'systemctl status app-restart.service'",
    "ssh rig-1.local 'systemctl is-active app'",
    "ssh rig-1.local 'cat /etc/hostname' | tee out.txt",
    "ssh rig-1.local 'ls' > out.log",
    "ssh rig-1.local 'cat > /tmp/run.sh' < run.sh",
    "tmux send-keys -t 1 'ssh rig-1.local ctl stop x' Enter",
    "git commit -m 'fix: kill stale process on reboot'",
    'ssh rig-1.local exit',
    'ssh jump.example ssh other.example bash < run.sh',
    "echo 'ctl status' | ssh jump.example ssh rig-1.local",
    "ssh jump.example ssh rig-1.local 'ctl status'",
    '',
    '   ',
  ]
  for (const command of passed) expect(classify(command, OK).hold, command).toBe(false)
})

test('match: a short flag of a web request counts only at the start of a word', async () => {
  const cfg = parseConfig('{"hosts":["rig-d.local"]}')
  expect(classify('curl -sS http://rig-d.local:8080/api/status', cfg).hold).toBe(false)
  expect(classify('wget -q -O - http://rig-d.local/a-d/b-F', cfg).hold).toBe(false)
  for (const command of [
    "curl -d '{}' http://rig-d.local/api/move",
    'curl -sd @body.json http://rig-d.local/api/move',
    'curl "http://rig-d.local/api/move" "-d" x=1',
    'curl --json \'{"x":1}\' http://rig-d.local/api/move',
    'curl -F file=@fw.bin http://rig-d.local/api/upload',
    'https PUT rig-d.local/api/move x=1',
  ]) {
    const v = classify(command, cfg)
    expect(v.hold, command).toBe(true)
    if (v.hold) expect(kindsOf(v), command).toContain('http-write')
  }
})

test('match: a stop passes alone, and not with a substitution or a hold beside it', async () => {
  expect(classify("ssh rig-1.local 'ctl stop all; ctl status'", OK)).toEqual({ hold: false, why: 'stop' })
  // A stop also waives class B on its own segment.
  expect(classify("ssh rig-1.local 'ctl stop all --kill'", OK)).toEqual({ hold: false, why: 'stop' })
  expect(classify("ssh rig-1.local 'ctl status --kill'", OK).hold).toBe(true)
  // A comment is tried against the site patterns and class A only: a class B word in one holds nothing.
  expect(classify("ssh rig-1.local 'uptime # after the reboot'", OK)).toEqual({ hold: false, why: 'read-only' })
  expect(classify("ssh rig-1.local 'ctl stop x; ctl move x 5'", OK).hold).toBe(true)
  expect(classify("ssh rig-1.local 'ctl stop `ctl move x 5`'", OK).hold).toBe(true)
  expect(classify("ssh rig-1.local 'ctl stop x | ctl move x 5'", OK).hold).toBe(true)
})

test('match: a broken config holds every remote shell and every class A match, and nothing else', async () => {
  for (const command of ["mosh somewhere 'ls'", 'bash -c "ssh x ls"', 'grep -n "write_register(" src/bus.py', PY8]) {
    const v = classify(command, BROKEN)
    expect(v.hold, command).toBe(true)
    if (v.hold) expect(kindsOf(v), command).toContain('config-error')
  }
  for (const command of ['ls -la', 'git status', 'pkill -f vite', 'sudo reboot']) {
    expect(classify(command, BROKEN).hold, command).toBe(false)
  }
})

test('match: classify never throws, whatever it is handed', async () => {
  const odd = [
    '<<',
    '<<<',
    '>',
    '|',
    '&&',
    ';;',
    '$(',
    '`',
    '${',
    "$'",
    '\\',
    'ssh',
    'ssh --',
    'ssh -o',
    'timeout',
    'sudo -u',
    'bash -c',
    'python3 -c',
    'a=(',
    '((((((((((',
    '))))))))))',
    '"'.repeat(999),
    "ssh rig-1.local ".repeat(50),
    'bash -c '.repeat(40) + 'ls',
    '\ud800 ssh rig-1.local \udfff',
  ]
  for (const command of odd) {
    const v = classify(command, OK)
    expect(typeof v.hold, command).toBe('boolean')
  }
  expect(typeof classify(undefined as unknown as string, OK).hold).toBe('boolean')
  expect(typeof classify('ls', undefined as unknown as ConfigRead).hold).toBe('boolean')
})

test('match: a long command is classified quickly', async () => {
  const long = `${'ssh rig-1.local \'grep -c done log\'; '.repeat(600)}ssh rig-1.local 'ctl home'`
  const t0 = performance.now()
  const v = classify(long, OK)
  expect(v.hold).toBe(true)
  expect(performance.now() - t0).toBeLessThan(1500)
  // Texts that once cost time with the square of their length: a pattern with an open gap, a long pipeline.
  const slow: [string, boolean][] = [
    [`python3 - <<'PY'\n${'x = 1 # tee dd tee dd\n'.repeat(9000)}PY`, false],
    [`echo '${'tee dd docker compose systemctl pio run '.repeat(6000)}'`, false],
    [`${Array(3000).fill('echo a').join(' | ')} | ${Array(3000).fill('ssh rig-1.local').join(' | ')}`, true],
    [Array(4000).fill("ssh rig-1.local 'cat x'").join(' | '), false],
    [`ssh rig-1.local "${'systemctl -a -b -c x '.repeat(9000)}"`, false],
  ]
  for (const [command, isHeld] of slow) {
    const t = performance.now()
    expect(classify(command, OK).hold, command.slice(0, 40)).toBe(isHeld)
    expect(performance.now() - t, command.slice(0, 40)).toBeLessThan(1500)
  }
})

test('match: a command too long to take apart is decided by its raw text', async () => {
  const pad = 'echo ok; '.repeat(50_000)
  expect(pad.length).toBeGreaterThan(400_000)
  const held = classify(`${pad}ssh rig-1.local 'sudo reboot'`, OK)
  expect(held.hold).toBe(true)
  if (held.hold) {
    expect(held.isCertain).toBe(false)
    expect(kindsOf(held)).toContain('power')
    expect(held.host).toBe('rig-1.local')
  }
  expect(classify(pad, OK)).toEqual({ hold: false, why: 'no-match' })
})

// ---- The review round of 2026-11-16: further forms of rows 74 to 165.

const PAD = 'a'.repeat(420)

test('match: further forms the review named are held, each for its kind', async () => {
  const nested = (command: string, times: number): string => {
    let out = command
    for (let k = 0; k < times; k++) out = `bash -c ${JSON.stringify(out)}`
    return out
  }
  const held: [string, HoldKind][] = [
    // Input that cannot be read.
    ['ssh rig-1.local "sudo $CMD"', 'unreadable'],
    [`printf '%s\\n' "$CMD" | ssh rig-1.local bash`, 'unreadable'],
    ['cat <<EOF | ssh rig-1.local bash\n$CMD\nEOF', 'unreadable'],
    ["ssh rig-1.local 'sh /dev/fd/0' < s.sh", 'unreadable'],
    ['ssh rig-1.local <<< "$(cat x)"', 'unreadable'],
    ['ssh rig-1.local bash <<< "$CMD"', 'unreadable'],
    ['ssh rig-1.local bash <<EOF\n$CMD\nEOF', 'unreadable'],
    ["ssh rig-1.local 'cd app && $PY run.py'", 'unreadable'],
    [`SCRIPT=$(cat x); ssh rig-1.local 'bash -s' <<< "$SCRIPT"`, 'unreadable'],
    ["ssh jump.example ssh rig-1.local <<< 'sudo reboot'", 'power'],
    [`CMD='sudo reboot'; ssh rig-1.local <<< "$CMD"`, 'power'],
    // Read-only commands that run or write through their own arguments.
    ["git -c diff.external='ctl move x 1' diff", 'site'],
    ["git -c core.fsmonitor='ssh rig-1.local sudo reboot' status", 'power'],
    ["git -c core.pager='ssh rig-1.local ctl move 5' log", 'site'],
    ["git grep -O'ctl move x 1' foo", 'site'],
    ['git diff --output=/sys/class/gpio/gpio4/value', 'gpio-set'],
    ["ssh rig-1.local 'sort names -o /dev/ttyUSB0'", 'serial-write'],
    ["ssh rig-1.local 'sort -uo /sys/class/gpio/gpio4/value names'", 'gpio-set'],
    [`ssh rig-1.local 'PAGER="sudo reboot" less log'`, 'power'],
    // Case arms and groups.
    [`case "$MODE" in false) ssh rig-1.local 'sudo reboot' ;; esac`, 'power'],
    [`case "$MODE" in (ls) ssh rig-1.local 'sudo reboot' ;; esac`, 'power'],
    [`case "$MODE" in a|ls) ssh rig-1.local 'sudo reboot' ;; esac`, 'power'],
    [`case "$MODE" in "true") ssh rig-1.local 'sudo reboot' ;; esac`, 'power'],
    [`case "$MODE" in y|yes|true) ssh rig-1.local 'sudo reboot' ;; esac`, 'power'],
    [
      `case "$(ssh rig-1.local 'ctl is-homed')" in\n  true) ssh rig-1.local 'ctl move x 10' ;;\n  false) ssh rig-1.local 'ctl home' ;;\nesac`,
      'site',
    ],
    ["(echo 'ctl move x 1'; echo 'ctl status') | ssh rig-1.local", 'unreadable'],
    ['r() {\n  ssh rig-1.local "$@"\n}\nr sudo reboot', 'unreadable'],
    // Substitutions in a heredoc body the shell expands.
    ["cat <<EOF\nMoved: `ssh rig-1.local 'ctl move x 10'`\nEOF", 'site'],
    ['cat <<EOF\n$(echo 1 > /sys/class/gpio/gpio17/value)\nEOF', 'gpio-set'],
    // Shell and interpreter flags.
    ["ssh rig-1.local 'bash -oe pipefail' < run.sh", 'unreadable'],
    ["ssh rig-1.local 'python3 -W ignore -' < run.py", 'unreadable'],
    ["ssh rig-1.local 'python3 -X dev - x 10' < run.py", 'unreadable'],
    ["ssh rig-1.local 'bash /dev/fd/0' < run.sh", 'unreadable'],
    [`bash -euo pipefail -c "ssh rig-1.local 'ctl move x 5'"`, 'site'],
    ["bash -x -c -e 'ssh rig-1.local sudo reboot'", 'power'],
    // ssh options.
    ['cat run.sh | ssh rig-1.local -T', 'unreadable'],
    ["ssh op@rig-1.local -p 2222 'bash -s' < run.sh", 'unreadable'],
    ['ssh rig-1.local -i ~/.ssh/rig_key bash < run.sh', 'unreadable'],
    ['ssh -P tag rig-1.local bash < run.sh', 'unreadable'],
    ['ssh rig-1.local -T < bench/slew-run.sh', 'unreadable'],
    ['ssh -o "RemoteCommand sudo reboot" rig-1.local', 'power'],
    ["ssh -o LocalCommand='ctl move x 1' -o PermitLocalCommand=yes other.example", 'site'],
    ["ssh -o HostName=rig-1.local x 'ctl move x 1'", 'site'],
    // Clobber redirects.
    ["ssh rig-1.local 'echo 1 >| /sys/class/gpio/gpio17/value'", 'gpio-set'],
    ['echo hi >| /dev/ttyUSB0', 'serial-write'],
    ['echo hi >& /dev/ttyUSB0', 'serial-write'],
    // tee, dd and pio run with a long or a multi-line gap.
    [`ssh rig-1.local sudo tee /tmp/${PAD} /sys/class/gpio/gpio17/value`, 'gpio-set'],
    [`echo hi | tee /tmp/${PAD} /dev/ttyUSB0`, 'serial-write'],
    [`python3 -c "import subprocess\nsubprocess.run(['sudo', 'tee',\n  '/sys/class/gpio/gpio17/value'], input=b'1')"`, 'gpio-set'],
    ['platformio run -e uno --target=upload', 'flash'],
    // A host kept in a variable.
    [`HOST=rig-1.local; curl -X POST "http://$HOST:8080/api/move" -d '{"x":1}'`, 'http-write'],
    ["H=rig-1.local; ssh $H 'sudo reboot'", 'power'],
    ["A=rig-1; ssh $A.local 'sudo reboot'", 'power'],
    ['DEV=/dev/ttyUSB0; echo G1 > $DEV', 'serial-write'],
    ['for h in rig-1.local; do ssh $h "$CMD"; done', 'unreadable'],
    // Rule 3a inside a substitution and in text fed to a local shell.
    ['OUT=`ssh rig-1.local bash < run.sh`', 'unreadable'],
    ['if ! OUT=$(ssh rig-1.local bash < run.sh 2>&1); then echo no; fi', 'unreadable'],
    ['OUT=$(ssh rig-1.local "$(cat cmd.txt)")', 'unreadable'],
    ["OUT=$(ssh rig-1.local 'python3 -' < move.py)", 'unreadable'],
    ['echo ${X:-$(ssh rig-1.local bash < run.sh)}', 'unreadable'],
    ["echo 'ssh rig-1.local sudo reboot' | sh", 'power'],
    // Line continuations.
    ["ssh rig-1.local \\\n  'sudo reboot'", 'power'],
    ["ssh rig-1.local 'ct\\\nl move x 1'", 'site'],
    [`python3 -c 'import os; os.system("reb\\\noot rig-1.local")'`, 'power'],
    // An interpreter beside a bare shell.
    ["ssh rig-1.local 'python3 --version && bash' <<'EOF'\nsudo reboot\nEOF", 'power'],
    [`ssh rig-1.local 'python3 -c "print(1)"; bash' <<< 'sudo reboot'`, 'power'],
    ["ssh rig-1.local 'bash; python3 post.py' <<< 'sudo reboot'", 'power'],
    // Too long or too deep to take apart.
    [`${'echo ok; '.repeat(50_000)}ssh rig-1.local "$CMD"`, 'unreadable'],
    [nested('ssh rig-1.local bash < run.sh', 9), 'unreadable'],
    // Uploads, serial devices, motor inputs, signals.
    ['curl -T fw.bin http://rig-1.local:8080/api/firmware', 'http-write'],
    ['curl http://rig-1.local:8080/api/firmware -T', 'http-write'],
    ['wget --method=PUT http://rig-1.local/api/move', 'http-write'],
    ['echo G1 | tee /dev/tty.usbserial-A1', 'serial-write'],
    ['dd if=fw.bin of=/dev/tty.usbmodem14101', 'serial-write'],
    ['echo G1 >> /dev/tty.usbmodem14101', 'serial-write'],
    ['python3 -c "axis.controller.input_vel -= 0.5"', 'motor-api'],
    ["ssh rig-1.local 'kill -s KILL 2186'", 'kill'],
    ["ssh rig-1.local 'pkill -f bench -0'", 'kill'],
    ["ssh rig-1.local 'pkill -0 bench; pkill bench'", 'kill'],
  ]
  for (const [command, kind] of held) {
    const v = classify(command, OK)
    const label = command.length > 90 ? `${command.slice(0, 87)}...` : command
    expect(v.hold, label).toBe(true)
    if (v.hold) expect(kindsOf(v), label).toContain(kind)
  }
  // The hold names the host an option or a variable gave.
  const byOption = classify("ssh -o HostName=rig-1.local x 'ctl move x 1'", OK)
  if (byOption.hold) expect(byOption.host).toBe('rig-1.local')
  const byVariable = classify("H=rig-1.local; ssh $H 'sudo reboot'", OK)
  if (byVariable.hold) {
    expect(byVariable.host).toBe('rig-1.local')
    expect(byVariable.isCertain).toBe(true)
  }
})

test('match: reads in the spellings the review named pass', async () => {
  const passed = [
    // A body that is data for a command, a variable that is assigned in the remote text itself.
    `ssh rig-1.local 'cat > /tmp/x' <<< "$DATA"`,
    "ssh rig-1.local 'X=ls; $X /tmp'",
    `ssh rig-1.local 'F=$(ls -t | head -1); tail -n 5 "$F"'`,
    "ssh rig-1.local '$HOME/bin/status'",
    // Read-only commands with a harmless variable, a count flag, a sort key, a format.
    "ssh rig-1.local 'LC_ALL=C grep -c shutdown log'",
    "ssh rig-1.local 'TZ=UTC ls -l /var/log/shutdown.log'",
    "ssh rig-1.local 'git grep -c shutdown'",
    "ssh rig-1.local 'sort -u names.txt | uniq -c'",
    "ssh rig-1.local 'sort -k2 -t: /etc/passwd | uniq -f 1'",
    "ssh rig-1.local 'journalctl -u app -o cat | grep -c reboot'",
    // Groups, case arms and function bodies that only read or stop.
    "(cd /tmp && ssh rig-1.local 'grep -c shutdown log')",
    `case "$1" in start) ssh rig-1.local 'ctl stop x' ;; esac`,
    "f() { ssh rig-1.local 'grep -c shutdown log'; }; f",
    // A heredoc body the shell does not expand, or whose substitution is escaped.
    "cat <<\\EOF\nMoved: $(ssh rig-1.local 'ctl move x 10')\nEOF",
    "cat <<EOF\nCost: \\$(ssh rig-1.local 'ctl move x 10')\nEOF",
    // Shell flags, options after the host, prefix flags.
    "ssh rig-1.local 'bash -euo pipefail /tmp/run.sh'",
    `bash -eu -o pipefail -c "ssh rig-1.local 'grep -c shutdown log'"`,
    "ssh rig-1.local 'python3 run.py' < data.csv",
    `ssh rig-1.local -q 'grep -n "ctl move" run.log'`,
    "ssh rig-1.local -t 'tail -f /var/log/shutdown.log'",
    "ssh rig-1.local -p 22 'grep -c shutdown log'",
    "ssh -o HostName=rig-1.local x 'grep -c shutdown log'",
    "env -u NAME ssh rig-1.local 'grep -c shutdown log'",
    "/usr/bin/time -p ssh rig-1.local 'grep -c shutdown log'",
    // Redirects and patterns that only look like the held ones.
    'echo hi 2>&1 > out.txt',
    'tee notes.txt; cat /sys/class/gpio/gpio17/value',
    'pio run --target=clean',
    'pio run -e uno\necho -t upload',
    'echo x > /dev/tty',
    'echo x > /dev/ttys003',
    'cat /dev/tty.usbmodem14101',
    'python3 -c "print(axis.controller.input_pos)"',
    // A variable target with no host named anywhere, a substitution that only reads.
    'ssh $H bash < run.sh',
    `echo "$(date) $(ssh rig-1.local 'uptime')"`,
    'trap - INT',
    "trap 'echo bye' EXIT",
    'echo "ls; ls" | bash',
    'x=$(( 1 + 2 )); echo $x',
    // A true line continuation: the second line is an argument of echo, and of the heredoc.
    "echo a \\\nssh rig-1.local 'sudo reboot'",
    "cat <<EOF\nnote \\\nEOF\nssh rig-1.local 'sudo reboot'\nEOF",
    // A timeout, and signal 0.
    'wget -q --tries=1 -T 5 -O- http://rig-1.local/status',
    "ssh rig-1.local 'pkill -0 -f bench'",
    "ssh rig-1.local 'killall -0 app && echo up'",
    "ssh rig-1.local 'kill -s 0 $(cat app.pid)'",
    // Too long to take apart, and no configured host in it.
    `${'echo ok; '.repeat(50_000)}ssh other.example bash < run.sh`,
  ]
  for (const command of passed) {
    const v = classify(command, OK)
    expect(v.hold, `${command.slice(0, 90)} ${JSON.stringify(v).slice(0, 200)}`).toBe(false)
  }
})

test('match: a value carried forward adds holds and names a host, and never takes a hold away', async () => {
  // The value names the rig: the remote shell is read as its literal spelling is.
  expect(classify("H=rig-1.local; ssh $H 'grep -c shutdown log'", OK)).toEqual({ hold: false, why: 'no-match' })
  expect(classify("H=rig-1.local; ssh $H 'ctl stop x'", OK)).toEqual({ hold: false, why: 'stop' })
  // Every other use is also read as written, and either reading holds.
  const held: [string, HoldKind][] = [
    [`CMD='grep -c shutdown log'; ssh rig-1.local "$CMD"`, 'unreadable'],
    [`P='ls'; echo "$P" | ssh rig-1.local`, 'unreadable'],
    [`T=tail; ssh rig-1.local "$T -f /var/log/shutdown.log"`, 'power'],
    ['G=grep; $G "ctl move" log', 'site'],
    [`S=stop; ssh rig-1.local "ctl $S x --reboot"`, 'power'],
    [`M=move; ssh rig-1.local "ctl $M x 1"`, 'site'],
  ]
  for (const [command, kind] of held) {
    const v = classify(command, OK)
    expect(v.hold, command).toBe(true)
    if (v.hold) expect(kindsOf(v), command).toContain(kind)
  }
  // A value that names no configured host, a name assigned twice, a loop variable, a name that is read,
  // an assignment in front of the command and a value that is itself a variable: the raw text decides.
  for (const command of [
    "H=other.example; ssh $H 'sudo reboot'; ping -c 1 rig-1.local",
    "H=other.example; H=rig-1.local; ssh $H 'sudo reboot'",
    "H=other.example; for H in rig-1.local; do ssh $H 'sudo reboot'; done",
    "H=other.example; read H < host.txt; ssh $H 'sudo reboot'; echo rig-1.local",
    "H=rig-1.local ssh $H 'sudo reboot'",
    "H='$X'; ssh $H 'sudo reboot'; echo rig-1.local",
    "H=$(pick); ssh $H 'sudo reboot'; echo rig-1.local",
  ]) {
    const v = classify(command, OK)
    expect(v.hold, command).toBe(true)
    if (v.hold) expect(v.isCertain, command).toBe(false)
  }
  // No configured host anywhere: nothing to hold.
  expect(classify("H=other.example; ssh $H 'sudo reboot'", OK).hold).toBe(false)
  expect(classify("X=other.example; H=$X; ssh $H 'sudo reboot'", OK).hold).toBe(false)
})

test('match: the checks added by the review read a long text in time proportional to its length', async () => {
  const heredoc = (body: string): string => `python3 - <<'PY'\n${body}\nPY`
  const slow: [string, string, boolean][] = [
    ['tee and dd words with no path', heredoc('tee dd '.repeat(50_000)), false],
    ['tee and dd words, then a path', heredoc(`${'tee dd '.repeat(50_000)}/sys/class/gpio/gpio1/value`), true],
    ['paths, then tee', heredoc(`${'/dev/ttyUSB0 /sys/class/gpio/ '.repeat(12_000)}tee`), false],
    ['tee, a separator, a path', heredoc('tee x; /dev/ttyUSB0 '.repeat(15_000)), false],
    ['a path 300,000 characters after tee', heredoc(`subprocess.run(["tee", ${'"a", '.repeat(60_000)}"/dev/ttyUSB0"])`), true],
    ['pio run with no upload', `python3 -c "${'pio run -t x '.repeat(25_000)}"`, false],
    ['pio and a long run of blanks', `python3 -c "pio${' '.repeat(300_000)}x"`, false],
    ['an upload far along the line', `pio run ${'-e board '.repeat(30_000)}-t upload`, true],
    ['signal 0 many times', `ssh rig-1.local "${'kill -0 1; '.repeat(30_000)}"`, false],
    ['signal 0 many times, then a kill', `ssh rig-1.local "${'kill -0 1; '.repeat(30_000)}kill 1"`, true],
    ['many assignments, each used once', Array.from({ length: 8000 }, (_, k) => `V${k}=a${k}; echo $V${k}`).join('; '), false],
    // Held since the third review round: 165,000 characters of values are more than one scan puts in
    // place, which is a limit of the reader, and the command names a configured host.
    ['one value used 15,000 times', `H=rig-1.local; ${'ssh $H uptime; '.repeat(15_000)}`, true],
    ['an empty value used 100,000 times', `E=; echo ${'$E '.repeat(100_000)}`, false],
    ['many substitutions', `echo ${'$(ls) '.repeat(40_000)}`, false],
    ['substitutions nested 30,000 deep', `echo ${'$('.repeat(30_000)}ls${')'.repeat(30_000)}`, false],
    ['substitutions that never close', `echo ${'$( '.repeat(100_000)}`, false],
    ['many parentheses', 'a) b ( c ) '.repeat(40_000), false],
    ['a heredoc of continuation lines', `cat <<EOF\n${'line \\\n'.repeat(60_000)}EOF`, false],
    ['a heredoc of substitutions', `cat <<EOF\n${'$(ls) `ls` '.repeat(30_000)}\nEOF`, false],
    ['a run of line continuations', `echo a ${'\\\n'.repeat(150_000)} b`, false],
    ['many trap strings', "trap 'ls' EXIT; ".repeat(15_000), false],
    ['many ssh options', `ssh ${'-o A=b '.repeat(30_000)}rig-1.local uptime`, false],
    ['a long text piped to a shell', `echo "${'ls; '.repeat(60_000)}" | bash`, false],
  ]
  for (const [name, command, isHeld] of slow) {
    const t = performance.now()
    expect(classify(command, OK).hold, name).toBe(isHeld)
    expect(performance.now() - t, name).toBeLessThan(1500)
  }
})

// ---- The second review round of 2026-11-16: further forms of rows 166 to 259.

test('match: an internal error holds a text that names a configured host', async () => {
  // A stop pattern that throws stands in for a fault inside the matcher: the scan ends in the catch.
  const boom = { exec: () => { throw new Error('boom') } } as unknown as RegExp
  const read: ConfigRead = { status: 'ok', config: { hosts: ['rig-1.local'], hold: [], stop: [boom], stopCommand: null }, warnings: [] }
  const held = classify('ssh rig-1.local bash < run.sh', read)
  expect(held.hold).toBe(true)
  if (held.hold) {
    expect(kindsOf(held)).toContain('unreadable')
    expect(held.host).toBe('rig-1.local')
    expect(held.isCertain).toBe(false)
  }
  // The patterns are still tried on the raw text, and a text that names no configured host passes.
  const classA = classify('make test; echo 1 > /sys/class/gpio/gpio17/value', read)
  expect(classA.hold).toBe(true)
  if (classA.hold) expect(kindsOf(classA)).toContain('gpio-set')
  expect(classify('make test', read)).toEqual({ hold: false, why: 'no-match' })
})

test('match: further forms of the second round are held, each for its kind', async () => {
  const held: [string, HoldKind][] = [
    // A substitution inside ${...}: other quotes around it, one level deeper, in an array, a here-string, remote text.
    [`echo "\${X:-'$(ssh rig-1.local "ctl move x 1")'}"`, 'site'],
    [`echo "\${X:-\${Y:-$(ssh rig-1.local 'sudo reboot')}}"`, 'power'],
    ['a=("${X:-$(ssh rig-1.local bash < run.sh)}")', 'unreadable'],
    ['cat <<< "${X:-$(ssh rig-1.local bash < run.sh)}"', 'unreadable'],
    [`echo "\${X:-$\\\n(ssh rig-1.local 'sudo reboot')}"`, 'power'],
    [`ssh rig-1.local bash -c 'echo "\${X:-$(sudo reboot)}"'`, 'power'],
    [`f() { echo "\${X:-$(ssh rig-1.local 'ctl move x 1')}"; }; f`, 'site'],
    // Braces that two shells close at different places cannot be read: the text names the rig, so it is held.
    [`echo "\${X:-'\${'}" ; ssh rig-1.local bash < run.sh; echo "}"`, 'unreadable'],
    // Groups, glob groups and the short forms of zsh.
    ['{ ssh rig-1.local bash < run.sh }', 'unreadable'],
    ['if [[ -n $X ]] then ssh rig-1.local bash < run.sh; fi', 'unreadable'],
    ['if (true) ssh rig-1.local bash < run.sh', 'unreadable'],
    ['f() ssh rig-1.local bash < run.sh', 'unreadable'],
    ['for x (a b) ssh rig-1.local "ctl move $x"', 'site'],
    ['ssh rig-1.local bash -s (a|b)* x < run.sh', 'unreadable'],
    ["ls *(e:'ssh rig-1.local sudo reboot':)", 'power'],
    ['case x in esac; if (cat run.sh | ssh rig-1.local bash) then echo ok; fi', 'unreadable'],
    ['while (cat run.sh | ssh rig-1.local bash) do sleep 1; done', 'unreadable'],
    ["case \"$M\" in a) echo a ;; esac\nif (ssh rig-1.local 'bash -s' < run.sh) then echo ok; fi", 'unreadable'],
    [`case "$M" in\n  a) echo a ;&\n  b) ssh rig-1.local 'sudo reboot' ;;\nesac`, 'power'],
    [`case "$M" in a) case "$N" in x) ssh rig-1.local 'ctl move x 1' ;; esac ;; esac`, 'site'],
    // A carried value in text a shell reads again, and both readings of a heredoc body.
    [`export BASE=http://rig-1.local:8080; bash -c 'curl -s -X POST "$BASE/api/move" -d 1'`, 'http-write'],
    [`export BASE=http://rig-1.local:8080\nbash <<'EOF'\ncurl -s -X POST "$BASE/api/move" -d 1\nEOF`, 'http-write'],
    [`BASE=http://rig-1.local:8080; a=( $(curl -s -X POST "$BASE/api/move" -d 1) )`, 'http-write'],
    [`BASE=http://rig-1.local:8080; OUT=$(echo "$(curl -s -X POST "$BASE/api/move" -d 1)")`, 'http-write'],
    [`CMD='grep -c done log'; cat <<EOF\n$(ssh rig-1.local "$CMD")\nEOF`, 'unreadable'],
    ["H=rig-1.local; OUT=$(ssh $H 'sudo reboot')", 'power'],
    // Line continuations.
    ["ssh rig-1.local $'echo a \\\nsudo reboot'", 'power'],
    ['ssh rig-1.local bash < \\\n\\\n  run.sh', 'unreadable'],
    [`echo "$\\\n(ssh rig-1.local 'sudo reboot')"`, 'power'],
    ["tee >\\\n(ssh rig-1.local 'sudo reboot') < notes.txt", 'power'],
    ['ssh rig-1.local < <(cat run.sh)', 'unreadable'],
    ["f() { ssh rig-1.local bash < \\\n  run.sh; }; f", 'unreadable'],
    // Assignments behind a word rule 2 looks through, with flags.
    ['function f { BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; }; f', 'http-write'],
    ['local -r BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1', 'http-write'],
    ['export -- BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1', 'http-write'],
    ["{ H=rig-1.local; ssh $H 'sudo reboot'; }", 'power'],
    // A shell's command string with arguments after it, behind a long option too.
    ["bash -c 'ssh rig-1.local bash < run.sh' arg0 arg1", 'unreadable'],
    ["bash -login -c 'cat run.sh | ssh rig-1.local' arg0", 'unreadable'],
    ['zsh -oshwordsplit -c "cat run.sh | ssh rig-1.local" arg0', 'unreadable'],
    // Signal 0 with a later signal option, in other spellings; and what pkill reads as no signal at all.
    ["ssh rig-1.local 'kill -0 -9 2186'", 'kill'],
    [`ssh rig-1.local "kill -0 '-s' KILL 2186"`, 'kill'],
    ["ssh rig-1.local 'kill -0 \\\n-9 2186'", 'kill'],
    ["ssh rig-1.local 'kill -0 2>&1 -s KILL 2186'", 'kill'],
    ["ssh rig-1.local 'kill -0 $(cat app.pid) -9'", 'kill'],
    ["ssh rig-1.local 'kill -0 $(pkill -9 bench)'", 'kill'],
    ["ssh rig-1.local 'f() { kill -0 -s KILL 2186; }; f'", 'kill'],
    ["ssh rig-1.local 'pkill -s 0 bench'", 'kill'],
    ["ssh rig-1.local 'pkill -n 0'", 'kill'],
    ["ssh rig-1.local 'pkill -0 -f bench -u root --signal=9'", 'kill'],
  ]
  for (const [command, kind] of held) {
    const v = classify(command, OK)
    const label = command.length > 90 ? `${command.slice(0, 87)}...` : command
    expect(v.hold, label).toBe(true)
    if (v.hold) expect(kindsOf(v), label).toContain(kind)
  }
  // A value carried from behind a brace names the host, and leaves the parse uncertain as before.
  const weak = classify("{ H=rig-1.local; ssh $H 'sudo reboot'; }", OK)
  if (weak.hold) {
    expect(weak.host).toBe('rig-1.local')
    expect(weak.isCertain).toBe(false)
  }
  // The earlier reading of a text is kept beside the newer one: its doubt does not make the verdict uncertain.
  const glued = classify("ssh rig-1.local 'bash -s' < run.sh *(N) ls", OK)
  if (glued.hold) expect(glued.isCertain).toBe(true)
})

test('match: reads in the spellings of the second round pass', async () => {
  const passed = [
    // Signal 0 with nothing after it that could name a signal.
    "ssh rig-1.local 'kill -0 $(pgrep -f bench)'",
    "ssh rig-1.local 'pkill -0 -fx bench'",
    `ssh rig-1.local 'kill -0 "$(cat "$PIDFILE")" 2>/dev/null && echo up'`,
    "ssh rig-1.local 'kill -0 -- -2186'",
    // Parameter expansions that run nothing held.
    'cd "${APP_DIR:-$(pwd)}" && ls',
    `echo "\${X:-none}" "\${Y:-it's fine}"`,
    `ssh rig-1.local "echo \${MSG:-it's fine}"`,
    'echo "${a[1]}" "${#a[@]}" "${x%%.*}"',
    // Globs, tests and arithmetic with parentheses.
    'ls *.log(N)',
    "[[ $x =~ ^(a|b)$ ]] && ssh rig-1.local 'grep -c shutdown log'",
    "if [[ -f x ]]; then ssh rig-1.local 'grep -c shutdown log'; fi",
    'x=$(( (1 + 2) * 3 )); echo $x',
    'a=(1 2 3); echo ${a[1]}',
    // Case arms and function bodies that only read.
    `case "$1" in start|run) ssh rig-1.local 'ctl status' ;; *) echo usage ;; esac`,
    `case "$1" in\n  (a) ssh rig-1.local 'grep -c shutdown log' ;;\n  *) echo no ;;\nesac`,
    'f() { local D=/var/log; ls "$D"; }; f',
    // A shell's long option written with one dash, and a command string with arguments.
    `bash -noprofile -norc -c "ssh rig-1.local 'grep -c shutdown log'"`,
    `bash -rcfile /dev/null -c "ssh rig-1.local 'grep -c shutdown log'"`,
    `bash -c 'ssh rig-1.local "grep -c shutdown log"' arg0`,
    // A carried value in a substitution that only reads.
    'BASE=http://rig-1.local:8080; S=$(curl -s "$BASE/api/status"); echo "$S"',
    'D=/var/log; N=$(ls "$D" | wc -l); echo "$N"',
    // Input from a process substitution that only reads, and a redirect target on the next line.
    `while read -r l; do echo "$l"; done < <(ssh rig-1.local 'tail -n 5 app.log')`,
    "ssh rig-1.local 'cat > /tmp/x' < \\\n  data.csv",
    "ssh rig-1.local 'ls -la' > \\\n  out.txt",
  ]
  for (const command of passed) {
    const v = classify(command, OK)
    expect(v.hold, `${command.slice(0, 90)} ${JSON.stringify(v).slice(0, 200)}`).toBe(false)
  }
})

test('match: nested eval and trap strings stay within the time a hook has', async () => {
  const nest = (depth: number, inner: string, open: string, close: string): string => {
    let out = inner
    for (let k = 0; k < depth; k++) out = open + out + close
    return out
  }
  // The same inner text is read at every level: each distinct text once, and the whole command within a budget of work.
  const shapes: [string, string, boolean][] = [
    ['trap and eval 8 deep around 385,000 characters', nest(8, `${'tee a; '.repeat(55_000)}ls`, 'trap "eval $(', ')" EXIT'), false],
    ['trap and eval 6 deep', nest(6, `${'tee a; '.repeat(55_000)}ls`, 'trap "eval $(', ')" EXIT'), false],
    ['trap and eval 4 deep', nest(4, `${'tee a; '.repeat(55_000)}ls`, 'trap "eval $(', ')" EXIT'), false],
    ['trap and eval 8 deep around echo', nest(8, `${'echo ok; '.repeat(42_700)}ls`, 'trap "eval $(', ')" EXIT'), false],
    ['trap and eval 8 deep around 140,000 characters', nest(8, `${'tee a; '.repeat(20_000)}ls`, 'trap "eval $(', ')" EXIT'), false],
    ['eval 8 deep', nest(8, `${'tee a; '.repeat(55_000)}ls`, 'eval "$(', ')"'), false],
    ['trap and eval 8 deep around a held command', nest(8, `${'tee a; '.repeat(55_000)}ssh rig-1.local bash < run.sh`, 'trap "eval $(', ')" EXIT'), true],
  ]
  for (const [name, command, isHeld] of shapes) {
    expect(command.length, name).toBeLessThan(400_000)
    const t = performance.now()
    expect(classify(command, OK).hold, name).toBe(isHeld)
    expect(performance.now() - t, name).toBeLessThan(600)
  }
})

test('match: the forms the second round reads take time proportional to their length', async () => {
  const slow: [string, string, boolean][] = [
    ['quoted braces with substitutions, 2,000 deep', `echo ${'"${a:-$('.repeat(2000)}ls${')}"'.repeat(2000)}`, false],
    ['quoted braces, 20,000 deep', `echo ${'"${a:-'.repeat(20_000)}${'}"'.repeat(20_000)}`, false],
    ['quoted substitutions, 20,000 deep', `echo ${'"$('.repeat(20_000)}ls${')"'.repeat(20_000)}`, false],
    ['braces that never close', `echo ${'${a:-'.repeat(60_000)}`, false],
    ['many quoted braces', `echo ${'"${a:-b}" '.repeat(30_000)}`, false],
    ['many quoted braces with a single quote', `echo ${`"\${a:-it's}" `.repeat(25_000)}`, false],
    ['many glob groups', `ls ${'x(N) '.repeat(60_000)}`, false],
    ['one word of many glued groups', `ls x${'(N)'.repeat(100_000)}`, false],
    ['many groups before then', `${'(ls) then '.repeat(30_000)}ls`, false],
    ['many brace groups', '{ ls } '.repeat(40_000), false],
    ['many tests', `${'[[ -n x ]] ls '.repeat(20_000)}`, false],
    ['many case arms', `case x in ${'a) ls ;; '.repeat(40_000)}esac`, false],
    ['many case clauses', 'case x in a) ls ;; esac; '.repeat(12_000), false],
    ['many function heads', 'f() { ls; }; '.repeat(25_000), false],
    ['signal 0 with no separator, which is no longer taken for one', `ssh rig-1.local "${'kill -0 1 '.repeat(30_000)}"`, true],
    ['signal 0 then match flags', `ssh rig-1.local "pkill -0 ${'-f '.repeat(100_000)}"`, false],
    ['signal 0 before many substitutions', `ssh rig-1.local "kill -0 ${'$(cat p) '.repeat(30_000)}"`, false],
    ['many redirects on the next line', `echo a ${'> \\\n /dev/null '.repeat(25_000)}`, false],
    ['many process substitutions as input', `cat ${'< <(ls) '.repeat(30_000)}`, false],
    ['many local assignments', `f() { ${Array.from({ length: 6000 }, (_, k) => `local V${k}=a${k}; echo $V${k}`).join('; ')}; }`, false],
    ['a carried value in many substitutions', `B=x; ${'echo $(echo $B); '.repeat(15_000)}`, false],
    ['many shell command strings', "bash -c 'ls' a b; ".repeat(15_000), false],
    ['a run of 125,000 variables on the rig', `ssh rig-1.local '${'$A;'.repeat(125_000)}'`, true],
  ]
  for (const [name, command, isHeld] of slow) {
    const t = performance.now()
    expect(classify(command, OK).hold, name).toBe(isHeld)
    expect(performance.now() - t, name).toBeLessThan(1500)
  }
})

// ---- The third review round of 2026-11-16: the reader's limits, and further forms of rows 260 on.

test('match: where the reader reaches one of its own limits, a command that names a configured host is held', async () => {
  const ssh = "ssh rig-1.local 'grep -c done log'"
  // Each shape trips one limit of the reader and is harmless by itself. [name, the shape, a separator]
  const shapes: [string, string][] = [
    ['more than 64 texts read a second time', arith(70)],
    ['more than 64 texts read as written', many(70, i => `echo "$(V=a${i}; echo $V)"`, '; ')],
    ['carried values past 20,000 characters, as words', `B=${'b'.repeat(100)}; echo ${many(250, () => '$B', ' ')}`],
    ['carried values past 20,000 characters, in substitutions', `B=${'b'.repeat(100)}; echo "$(echo ${many(250, () => '$B', ' ')})"`],
    ['carried values past 20,000 characters, in a heredoc', `B=${'b'.repeat(100)}; cat <<EOF\n${many(250, () => '$B', ' ')}\nEOF`],
    ['a value of more than 2,000 characters', `B=${'b'.repeat(2001)}; echo "$B"`],
    ['quoted substitutions nested 101 deep', quotedNest(101)],
    ['quoted braces nested 102 deep', `echo ${braceNest(102)}`],
    ['quoted braces with a single quote, 40 deep', `echo ${quoteInBraces(40)}`],
    ['texts nested nine deep', many(9, () => 'eval ', '') + 'ls'],
    ['substitutions nested twelve deep', `echo ${'$('.repeat(12)}ls${')'.repeat(12)}`],
    ['braces that two shells close at different places', `X=$(echo "\${a:-'}'x}")`],
  ]
  for (const [name, shape] of shapes) {
    for (const sep of ['; ', '\n']) {
      // After the shape and before it: the limit is one of the whole call, wherever it is reached.
      for (const command of [`${shape}${sep}${ssh}`, `${ssh}${sep}${shape}`]) {
        const v = classify(command, OK)
        expect(v.hold, `${name}: ${JSON.stringify(v).slice(0, 200)}`).toBe(true)
        if (!v.hold) continue
        expect(kindsOf(v), name).toContain('unreadable')
        expect(v.host, name).toBe('rig-1.local')
        expect(v.isCertain, name).toBe(false)
      }
      // The same with no configured host and no pattern in it: nothing to hold.
      expect(classify(`${shape}${sep}ls -la`, OK).hold, name).toBe(false)
    }
    // A class B word is tried on the whole raw command, as rule 7 does.
    const power = classify(`${shape}; ssh rig-1.local 'grep -c shutdown log'`, OK)
    expect(power.hold && kindsOf(power).includes('power'), name).toBe(true)
  }
  // Too long to take apart, and past the work of one call.
  const long = classify(`${'echo ok; '.repeat(45_000)}${ssh}`, OK)
  expect(long.hold && kindsOf(long).includes('unreadable') && !long.isCertain).toBe(true)
  const work = classify(`${many(8, () => 'eval "$(', '')}${'echo ok; '.repeat(40_000)}${many(8, () => ')"', '')}; ${ssh}`, OK)
  expect(work.hold && kindsOf(work).includes('unreadable') && !work.isCertain).toBe(true)
  // A host the command names only through a carried value counts too.
  const carried = classify(`A=rig-1; ${arith(70)}; ssh $A.local bash < run.sh`, OK)
  expect(carried.hold && kindsOf(carried).includes('unreadable')).toBe(true)
  // A quote that really is not closed is the plain uncertain parse of rule 7: the patterns alone.
  expect(classify(`${ssh}; echo "open`, OK).hold).toBe(false)
  // Within the limits nothing changes: a nest of eight texts and 60 second readings around a read.
  expect(classify(`${quotedNest(8)}; ${ssh}`, OK).hold).toBe(false)
  expect(classify(`${arith(60)}; ${ssh}`, OK).hold).toBe(false)
})

test('match: further forms of the third round are held, each for its kind', async () => {
  const held: [string, HoldKind][] = [
    // The second readings spent by other harmless lines, and a hold that only the second reading sees.
    [`${many(70, i => `r${i}=$(if (test -f /tmp/f${i}) then echo y; fi)`)}\nf() ( case $1 in a) ssh rig-1.local bash < run.sh;; esac )`, 'unreadable'],
    [`${many(70, i => `x${i}=$(cat /tmp/f${i} 2>\\\n/dev/null)`)}\nssh rig-1.local $'echo a \\\nbash' < run.sh`, 'unreadable'],
    [`${many(70, i => `x${i}=$(echo $\\\nHOME${i})`)}\nssh rig-1.local $'echo a \\\nbash' < run.sh`, 'unreadable'],
    [`${many(70, i => `v${i}="$(cat "\${CFG:-\${HOME}/.cfg}/f${i}")"`)}\nssh rig-1.local $'echo a \\\nbash' < run.sh`, 'unreadable'],
    [`${arith(70)}; ssh rig-1.local 'time (bash -s)' < run.sh`, 'unreadable'],
    // The room for carried values spent inside other texts the shell reads again.
    [`${LONG_Y}; ${many(10, i => `bash -c 'echo $Y ${i}'`, '; ')}; BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1`, 'http-write'],
    [`${LONG_Y}; diff ${tenTimes(i => `<(echo $Y ${i})`)}; SSH="ssh rig-1.local"; $SSH 'sudo reboot'`, 'power'],
    [`${LONG_Y}; X=$(echo ${tenTimes(() => '$Y')}); SSH="ssh rig-1.local"; $SSH bash < run.sh`, 'unreadable'],
    [`${LONG_Y}; bash <<'EOF'\n${many(10, i => `echo $Y ${i}`)}\nEOF\nDEV=/dev/ttyUSB0; echo G1 X10 > "$DEV"`, 'serial-write'],
    [`${LONG_Y}; echo ${tenTimes(i => `$(echo $Y ${i})`)}; BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1`, 'http-write'],
    [`${LONG_Y}; echo ${tenTimes(i => `$(echo $Y ${i})`)}; SSH="ssh rig-1.local"; $SSH 'sudo reboot'`, 'power'],
    // Past the nest the reader follows, at other depths and with other commands behind it.
    [`${quotedNest(103)}\nssh rig-1.local "$CMD"`, 'unreadable'],
    [`${quotedNest(105)}\ncat run.sh | ssh rig-1.local bash`, 'unreadable'],
    [`${quotedNest(107)}; ssh rig-1.local bash < run.sh`, 'unreadable'],
    [`echo ${braceNest(200)}; ssh rig-1.local "$CMD"`, 'unreadable'],
    [`echo ${braceNest(400)}\ncat run.sh | ssh rig-1.local bash`, 'unreadable'],
    [`${quotedNest(101)}\nssh rig-1.local 'sort -o /sys/class/gpio/gpio17/value one.txt'`, 'unreadable'],
    // A subshell behind `time`, a function's `()` and a case arm, in other spellings.
    ['time -p (ssh rig-1.local bash) < run.sh', 'unreadable'],
    ['{ time (ssh rig-1.local bash) < run.sh }', 'unreadable'],
    ["ssh rig-1.local 'time (bash -s)' < run.sh", 'unreadable'],
    ['function f () (ssh rig-1.local bash) < run.sh; f', 'unreadable'],
    ['case $1 in\n  a) echo hi ;;\n  b) (cat run.sh | ssh rig-1.local bash) ;;\nesac', 'unreadable'],
    ["time (ssh rig-1.local 'sudo reboot')", 'power'],
    ["f() (ssh rig-1.local 'ctl move x 1'); f", 'site'],
    [`case "$1" in a) echo a ;; b) (ssh rig-1.local 'pkill -f bench') ;; esac`, 'kill'],
    ['time (cat run.sh | ssh rig-1.local bash)', 'unreadable'],
    // A weak value in the other places a hold depends on a variable being unknown.
    ['{ H=other.example; }; ssh $H bash < run.sh; ping -c 1 rig-1.local', 'unreadable'],
    ['declare H=other.example; ssh $H "$CMD"; ping -c 1 rig-1.local', 'unreadable'],
    ['time H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local', 'unreadable'],
    ["ssh rig-1.local 'f() { local C=ls; }; $C /tmp'", 'unreadable'],
    ["ssh rig-1.local 'if [ -n \"$1\" ]; then RUN=echo; fi; $RUN done'", 'unreadable'],
    // A bare name behind a declaring word, in the other declaring words and with several names.
    ['typeset B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1', 'http-write'],
    ['declare -g B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1', 'http-write'],
    ['local A B C; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1', 'http-write'],
    ['B=http://rig-1.local:8080; readonly B; curl -X POST "$B/api/move" -d 1', 'http-write'],
    ['f() {\n  local port\n  port=/dev/ttyUSB0\n  echo G1 X10 > "$port"\n}\nf', 'serial-write'],
    ['local SSH; SSH="ssh rig-1.local"; $SSH bash < run.sh', 'unreadable'],
    // A value behind a bare declaration is a weak one: it never makes a target certain.
    ["local H; H=rig-1.local; ssh $H 'grep -c shutdown log'", 'power'],
    // A value whose name stands elsewhere as a bare word, is assigned twice, or was put together from a weak value.
    ['BASE=http://other.example; BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move" -d 1', 'http-write'],
    ['port=/dev/ttyUSB0; stty -F "$port" 115200; echo port ready; echo G1 X10 > "$port"', 'serial-write'],
    ["H=rig-1.local; echo H; ssh $H 'grep -c shutdown log'", 'power'],
    ['{ A=other.example; }; H=op@$A; ssh "$H" "$CMD"; ping -c 1 rig-1.local', 'unreadable'],
    ['local A=other.example; B=$A; C=$B; cat run.sh | ssh $C bash; ping -c 1 rig-1.local', 'unreadable'],
    ['if x; then D=/dev; fi; P=$D/ttyUSB0; echo G1 X10 > "$P"', 'serial-write'],
    ["H=other.example; for H in rig-1.local; do ssh $H bash < run.sh; done", 'unreadable'],
    // Signal 0 with a later signal option behind other redirects and quoted or escaped separators.
    ["ssh rig-1.local 'killall -0 \"a;b\" -s KILL'", 'kill'],
    ["ssh rig-1.local 'pkill -0 -f \"a&b\" --signal 9'", 'kill'],
    ["ssh rig-1.local 'pkill -0 bench\\|runner --signal 9'", 'kill'],
    ["ssh rig-1.local \"pkill -0 'a|b' --signal 9\"", 'kill'],
    ["ssh rig-1.local 'kill -0 2186 2>|/dev/null -9'", 'kill'],
    ['ssh rig-1.local "kill -0 2186 >\\\n| /dev/null -s KILL"', 'kill'],
    // The plan's own rule: any later word that starts with a dash ends the exemption, a process group too.
    [`ssh rig-1.local 'kill -0 $(pgrep -f "bench run") && echo alive'`, 'kill'],
    ["ssh rig-1.local 'kill -0 -1234 2>/dev/null; echo $?'", 'kill'],
    // Substitutions inside the braces of a reference, in the other spellings.
    ["ssh rig-1.local 'ctl stop ${X:-<(sudo reboot)}'", 'power'],
    ["bash -c 'tee ${LOG:->(ssh rig-1.local sudo reboot)} < /dev/null'", 'power'],
    [`cat \${A:-\${B:-<(ssh rig-1.local 'ctl move x 1')}}`, 'site'],
    ["ssh rig-1.local 'echo ${ sudo reboot; }'", 'power'],
    [`ssh rig-1.local 'echo "\${| sudo reboot; }"'`, 'power'],
    ["ssh rig-1.local 'echo ${\n  sudo reboot\n}'", 'power'],
    ["echo ${ ssh rig-1.local 'ctl move x 1'; }", 'site'],
    [`echo "\${X:-\${ ssh rig-1.local 'ctl move x 1'; }}"`, 'site'],
    ["ssh rig-1.local 'cat <<EOF\n${ sudo reboot; }\nEOF'", 'power'],
    ["x=${ ssh rig-1.local bash < run.sh; }", 'unreadable'],
    // A compose verb far along its line.
    [`ssh rig-1.local 'docker-compose -f /srv/${'a'.repeat(400)}/compose.yml restart app'`, 'service'],
    // A variable with a very long name is still nothing but a variable.
    [`ssh rig-1.local "$${'A'.repeat(120)}"`, 'unreadable'],
  ]
  for (const [command, kind] of held) {
    const v = classify(command, OK)
    const shown = command.length > 120 ? `${command.slice(0, 60)} ... ${command.slice(-60)}` : command
    expect(v.hold, `${shown} ${JSON.stringify(v).slice(0, 200)}`).toBe(true)
    if (v.hold) expect(kindsOf(v), shown).toContain(kind)
  }
})

test('match: reads in the spellings of the third round pass', async () => {
  const passed = [
    // A subshell that only reads, behind `time`, a function's `()` and in any case arm.
    "time (grep -rn 'write_register(' src/ | wc -l)",
    "time -p (ssh rig-1.local 'grep -c shutdown log')",
    "f() ( ssh rig-1.local 'grep -c shutdown log' )",
    "f() ( ssh rig-1.local 'pgrep -f kill' )",
    "count() (\n  ssh rig-1.local 'grep -c shutdown log'\n)\ncount",
    `case "$1" in\n  a) (ssh rig-1.local 'grep -c shutdown log') ;;\n  b) (ssh rig-1.local 'tail -n 5 reboot.log') ;;\nesac`,
    "time ssh rig-1.local 'grep -c shutdown log'",
    'time ls (a|b)*',
    // The limits of the reader, in a command that names no configured host and matches no pattern.
    `${arith(70)}; echo done`,
    `${quotedNest(120)}; echo done`,
    `echo ${quoteInBraces(60)}`,
    // Harmless lines within the reader's limits, around a read on the rig.
    `${arith(40)}; ssh rig-1.local 'grep -c shutdown log'`,
    `${quotedNest(8)}; ssh rig-1.local 'grep -c shutdown log'`,
    `echo ${quoteInBraces(4)}; ssh rig-1.local 'grep -c done log'`,
    `B=${'b'.repeat(100)}; echo ${many(150, () => '$B', ' ')}; ssh rig-1.local 'grep -c shutdown log'`,
    // A strong value names its host: a read through it passes, and one for another host is not held.
    'H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local',
    "H=rig-1.local; ssh $H 'grep -c shutdown log'",
    // A value carried as a weak one that is used for nothing held.
    'URL=http://rig-1.local:8080/api/status; curl -s "$URL"; echo URL done',
    'dev=/dev/ttyUSB0; stty -F "$dev" 115200; cat "$dev"',
    "H=rig-1.local; ssh $H 'grep -c done log'; echo H done",
    // A declared name that is used for nothing held.
    'f() {\n  local dir\n  dir=/var/log\n  ls "$dir"\n}\nf',
    'export LOG; LOG=/var/log/app.log; tail -n 5 "$LOG"',
    // Signal 0 behind a clobber redirect with nothing after it, and piped on.
    "ssh rig-1.local 'kill -0 2186 >| /dev/null'",
    "ssh rig-1.local 'kill -0 2186 | cat'",
    "ssh rig-1.local 'pkill -0 \"bench|runner\"'",
    // A reference with a default that runs nothing.
    'cat ${F:-/dev/null}',
    'echo "${X:-a (b) c}" ${Y:-<none>}',
    "ssh rig-1.local 'docker compose ps'",
  ]
  for (const command of passed) {
    const v = classify(command, OK)
    expect(v.hold, `${command.slice(0, 90)} ${JSON.stringify(v).slice(0, 200)}`).toBe(false)
  }
})

test('match: a single quote inside nested braces is read in time proportional to the length', async () => {
  const shapes: [string, string][] = [
    ['quoted, 27 deep', `echo ${quoteInBraces(27)}`],
    ['quoted, 40 deep', `echo ${quoteInBraces(40)}`],
    ['quoted, 100 deep', `echo ${quoteInBraces(100)}`],
    ['unquoted, 40 deep', `echo ${quoteInBraces(40, '${a:-\'\'"', '"}')}`],
    ['unquoted, 100 deep', `echo ${quoteInBraces(100, '${a:-\'\'"', '"}')}`],
    ['quotes on both sides, 40 deep', `echo ${quoteInBraces(40, '${a:-\'x\'"', '"\'y\'}')}`],
    ['quotes on both sides, 100 deep', `echo ${quoteInBraces(100, '${a:-\'x\'"', '"\'y\'}')}`],
    ['quoted with quotes on both sides, 40 deep', `echo ${quoteInBraces(40, '"${a:-\'x\'', '\'y\'}"')}`],
    ['quoted with quotes on both sides, 100 deep', `echo ${quoteInBraces(100, '"${a:-\'x\'', '\'y\'}"')}`],
    ['an apostrophe at every level, 100 deep', `echo ${quoteInBraces(100, '"${a:-it\'s ', '}"')}`],
    ['40 deep, 200 times', many(200, () => `echo ${quoteInBraces(40)}`, '; ')],
    ['beside a held command', `ssh rig-1.local 'ctl move x 10'; echo ${quoteInBraces(100)}`],
    ['in remote text', `ssh rig-1.local <<'EOF'\necho ${quoteInBraces(100)}\nEOF`],
    ['with no config', `echo ${quoteInBraces(100)}`],
    // At the length limit, where a search that is asked again from every level would add up.
    ['quoted, 39,000 deep', `echo ${quoteInBraces(39_000)}`],
    ['unquoted, 39,000 deep', `echo ${quoteInBraces(39_000, '${a:-\'\'"', '"}')}`],
    ['16 deep around an open backtick, 300,000 characters behind it', `echo ${quoteInBraces(16).replace('x', '`x')} ${'p'.repeat(300_000)}`],
    ['16 deep around an odd quote, 300,000 characters behind it', `echo ${quoteInBraces(16).replace('x', "'x")} ${'p'.repeat(300_000)}`],
    ['16 deep around an open backtick in a substitution', `echo ${quoteInBraces(16).replace('x', '$(echo `x')} ${'p'.repeat(300_000)}`],
    ['a heredoc of a substitution with 50,000 references', `cat <<EOF\n$(echo ${'"${a}" '.repeat(50_000)})\nEOF`],
    // One word of glued pairs at the length limit: the word is not read again at every pair.
    ['130,000 glued groups', `ls x${'(N)'.repeat(130_000)}`],
  ]
  for (const [name, command] of shapes) {
    // Twice: the second call must not be slower for what the first one left behind.
    for (let run = 0; run < 2; run++) {
      const t = performance.now()
      const v = classify(command, name === 'with no config' ? NONE : OK)
      expect(performance.now() - t, name).toBeLessThan(600)
      expect(v.hold, name).toBe(name === 'beside a held command' || name === 'in remote text')
    }
  }
})
