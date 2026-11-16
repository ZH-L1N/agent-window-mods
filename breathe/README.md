# breathe

A guided breathing exercise in the band above the prompt while Claude works.
After a turn has run for 10 seconds, an animated shape grows and shrinks with
the breath, with the phase line (`Breathe in... 4s`) and the exercise name
under it. It goes when Claude answers; a short turn shows nothing. The band is
drawn by a Client module on the drawing thread, terminal only, and it steps
aside for a survey.

Exercises: Coherent Breathing (5.5s in, 5.5s out; the default), the
Physiological Sigh, Box Breathing and 4-7-8 Breathing. Each turn picks one of
three animation styles at random (pulse, wave or melody), never the one just
shown; all seventeen styles can be chosen by name.

## Commands

```text
/breathe                  status: style random · delay 10s · spinner off
/breathe on | off         show or hide the band while Claude works
/breathe hrv | sigh | box | 478
                          pick the exercise
/breathe style <name>     one of the seventeen styles, or random
/breathe delay <s>        seconds Claude works before the band appears (0 = at once)
/breathe spinner on|off   also put the breath's phase in the spinner line (off by default)
/breathe help             the full list
```

Settings are kept in the mod's store and survive restarts.

Fork of https://github.com/linxuan-sys/claude-breathe at `d8cc7b98ee52a841c8874139d4ab5ff37005fcfc` (MIT). Local changes are in PROVENANCE.md.

## Install

```sh
claude plugin install breathe@zehui-mods --scope user
```
