import test from 'tape'
import lolex from 'lolex'
import sagaMiddleware, { END } from '../../src'
import { createStore, applyMiddleware } from 'redux'
import delayP from '@redux-saga/delay-p'
import { take, cancel, throttle } from '../../src/effects'

test('throttle', assert => {
  const clock = lolex.install()
  assert.plan(1)

  const actual = []
  const expected = [['a1', 'a2', 0], ['a1', 'a2', 10], ['a1', 'a2', 20], ['a1', 'a2', 30], ['a1', 'a2', 34]]
  const middleware = sagaMiddleware()
  const store = applyMiddleware(middleware)(createStore)(() => {})
  middleware.run(root)

  function* root() {
    const task = yield throttle(100, 'ACTION', worker, 'a1', 'a2')
    yield take('CANCEL_WATCHER')
    yield cancel(task)
  }

  function* worker(arg1, arg2, { payload }) {
    actual.push([arg1, arg2, payload])
  }

  const dispatchedActions = []
  for (let i = 0; i < 35; i++) {
    dispatchedActions.push(
      delayP(i * 10)
        .then(() => i)
        .then(val => store.dispatch({ type: 'ACTION', payload: val }))
        .then(() => clock.tick(10)), // next tick
    )
  }

  Promise.resolve()
    .then(() => clock.tick(1)) // just start for the smallest tick
    .then(() => clock.tick(10)) // tick past first delay

  dispatchedActions[34]
    // wait so trailing dispatch gets processed
    .then(() => clock.tick(100))
    .then(() => store.dispatch({ type: 'CANCEL_WATCHER' }))
    // shouldn't be processed cause of getting canceled
    .then(() => store.dispatch({ type: 'ACTION', payload: 40 }))
    .then(() => {
      assert.deepEqual(actual, expected, 'throttle must ignore incoming actions during throttling interval')
    })
    .catch(err => assert.fail(err))
    .then(() => clock.uninstall())
})

test('throttle: pattern END', assert => {
  assert.plan(2)

  const delayMs = 20
  const middleware = sagaMiddleware()
  const store = createStore(() => ({}), {}, applyMiddleware(middleware))
  const mainTask = middleware.run(saga)

  let task
  function* saga() {
    task = yield throttle(delayMs, 'ACTION', fnToCall)
  }

  let called = false
  function* fnToCall() {
    called = true
  }

  store.dispatch(END)
  mainTask
    .toPromise()
    .then(() => store.dispatch({ type: 'ACTION' }))
    .then(() => delayP(2 * delayMs))
    .then(() => {
      assert.equal(task.isRunning(), false, 'should finish throttle task on END')
      assert.equal(called, false, 'should not call function if finished with END')
      assert.end()
    })
    .catch(err => assert.fail(err))
})
