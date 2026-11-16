// The Tests pane, drawn from the history alone. register.tsx resolves the elements
// and passes what a press should do; nothing here touches state.
import type { ElementTable, RenderElement } from 'claude-code'

import type { Failure, Run } from '../types'
import { ago, duration, isGreen, shortCommand, total } from './format'

export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

export type View = {
  list: Run[]
  index: number
  chosen: number
  now: number
  rows: number
  show: (index: number) => void
  pick: (failure: number) => void
}

const ERROR_LINE = /^\s*(E\s|>|\+|error|Error|\w*Error:|assert|panicked|thread ')/
const QUIET_LINE = /^\s*(at |❯|\d+ \||-)/

export function emptyPane(ui: Ui): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>No test runs yet</Text>
      <Text dimColor wrap="wrap">
        The next time Claude runs your tests they show up here: vitest, jest, pytest, cargo, go, bun and deno.
      </Text>
    </Box>
  )
}

function header(ui: Ui, run: Run, now: number): RenderElement {
  const { Box, Text } = ui
  const unit = run.unit === 'packages' ? 'package' : 'test'
  const verdict = isGreen(run)
    ? `✓ ${total(run) === 1 ? `1 ${unit} passed` : `All ${total(run)} ${unit}s passed`}`
    : `✗ ${run.failed} failed`
  const meta = [duration(run.durationMs), run.runner, ago(now - run.at)].filter(Boolean).join(' · ')

  return (
    <Box key="header" flexDirection="column">
      <Box flexDirection="row" gap={2}>
        <Text color={isGreen(run) ? 'green' : 'red'} bold>
          {verdict}
        </Text>
        {isGreen(run) ? null : <Text color="green">{`${run.passed} passed`}</Text>}
        {run.skipped > 0 ? <Text color="yellow">{`${run.skipped} skipped`}</Text> : null}
        <Text dimColor>{meta}</Text>
      </Box>
      <Text dimColor wrap="truncate-end">{`$ ${shortCommand(run.command)}`}</Text>
    </Box>
  )
}

// One block per run, oldest first; the shown one is a dot.
function history(ui: Ui, view: View): RenderElement {
  const { Box, Text, Button } = ui
  const { list, index, show } = view
  const blocks = list.map((one, i) => (
    <Text key={`run-${i}`} color={isGreen(one) ? 'green' : 'red'}>
      {i === index ? '●' : '■'}
    </Text>
  ))

  return (
    <Box key="history" flexDirection="row" gap={2} marginTop={1}>
      <Text>{blocks}</Text>
      {index > 0 ? <Button key="older" label="older" hotkey="p" plain dimColor onPress={() => show(index - 1)} /> : null}
      {index < list.length - 1 ? <Button key="newer" label="newer" hotkey="n" plain dimColor onPress={() => show(index + 1)} /> : null}
      {index < list.length - 1 ? <Button key="latest" label="latest" hotkey="l" plain dimColor onPress={() => show(list.length - 1)} /> : null}
    </Box>
  )
}

// A window of the list around the picked failure, so a long list never pushes the detail off.
function failures(ui: Ui, run: Run, view: View, room: number): RenderElement {
  const { Box, Text, Button } = ui
  const { chosen, pick } = view
  const first = Math.max(0, Math.min(chosen - Math.floor(room / 2), run.failures.length - room))
  const rows = run.failures.slice(first, first + room).map((one, at) => {
    const i = first + at

    return (
      <Box key={`row-${i}`} flexDirection="row" gap={1}>
        <Text color="red">{i === chosen ? '›' : ' '}</Text>
        <Button key={`fail-${i}`} label={one.name} plain dimColor={i !== chosen} onPress={() => pick(i)} />
        {one.file === undefined ? null : <Text dimColor wrap="truncate-start">{` ${one.file}`}</Text>}
      </Box>
    )
  })

  return (
    <Box key="failures" flexDirection="column" marginTop={1}>
      {rows}
      {run.failures.length > room ? (
        <Box flexDirection="row" gap={2}>
          <Text dimColor>{`${chosen + 1}/${run.failures.length}`}</Text>
          <Button key="prev" label="prev" hotkey="k" plain dimColor onPress={() => pick(chosen - 1)} />
          <Button key="next" label="next" hotkey="j" plain dimColor onPress={() => pick(chosen + 1)} />
        </Box>
      ) : null}
    </Box>
  )
}

function detail(ui: Ui, failure: Failure, room: number): RenderElement {
  const { Box, Text } = ui
  const lines =
    failure.detail.length === 0
      ? [<Text key="d-0" color="red" wrap="wrap">{failure.message || 'No error output captured.'}</Text>]
      : failure.detail.slice(0, room).map((line, i) => (
          <Text key={`d-${i}`} color={ERROR_LINE.test(line) ? 'red' : undefined} dimColor={QUIET_LINE.test(line)} wrap="truncate-end">
            {line || ' '}
          </Text>
        ))
  const more = failure.detail.length - room

  return (
    <Box key="detail" flexDirection="column" marginTop={1} borderStyle="round" borderColor="red" paddingX={1}>
      <Text bold wrap="wrap">{failure.name}</Text>
      {lines}
      {more > 0 ? <Text dimColor>{`… ${more} more lines`}</Text> : null}
    </Box>
  )
}

export function testsPane(ui: Ui, view: View): RenderElement {
  const { Box } = ui
  const run = view.list[view.index]

  if (run === undefined) {
    return emptyPane(ui)
  }

  const failure = run.failures[view.chosen]
  const listRoom = Math.min(run.failures.length, Math.max(3, Math.floor((view.rows - 8) / 3)))
  const detailRoom = Math.max(3, view.rows - listRoom - 11)

  return (
    <Box flexDirection="column" paddingX={1}>
      {header(ui, run, view.now)}
      {history(ui, view)}
      {run.failures.length > 0 ? failures(ui, run, view, listRoom) : null}
      {failure === undefined ? null : detail(ui, failure, detailRoom)}
    </Box>
  )
}
