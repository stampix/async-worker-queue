# async-worker-queue

`async-worker-queue` is an library written in TypeScript that provides a simple and efficient way to manage a queue of asynchronous tasks using worker threads.
It exposes a single class `AsyncWorkerQueue` that encapsulates the functionality of the package.

## Installation

You can install `async-worker-queue` using npm:

```shell
npm install async-worker-queue
```

Alternatively, you can use yarn:

```shell
yarn add async-worker-queue
```

Or, if you prefer to use pnpm:

```shell
pnpm add async-worker-queue
```

## Usage

To use `AsyncWorkerQueue`, first import the package:

```typescript
import { AsyncWorkerQueue } from 'async-worker-queue';
```

### Class: AsyncWorkerQueue

The `AsyncWorkerQueue` class represents a queue of asynchronous tasks that are processed by worker threads. It provides methods to enqueue tasks and configure the behavior of the queue.

#### Constructor

```typescript
constructor(
    private _createWorker: (i: number) => Promise<Execute<T, R>>,
    public concurrency: number,
    private _options: {
      removeWorkerOnError?: boolean;
      recreateWorkerOnError?: boolean;
    } = {}
)
```

Creates an instance of `AsyncWorkerQueue` with the following parameters:

- `_createWorker` (required): A function that creates and returns a worker thread. It takes an index parameter `i` and should return a `Promise` that resolves to a function `Execute<T, R>`. This function represents the task to be executed by the worker thread.
- `concurrency` (required): The maximum number of tasks that can be executed concurrently. This value determines the number of worker threads that will be created.
- `_options` (optional): An object that allows you to configure additional options:
    - `removeWorkerOnError` (optional): A boolean value indicating whether a worker thread should be removed from the queue if it encounters an error while executing a task. Default value is `false`.
    - `recreateWorkerOnError` (optional): A boolean value indicating whether a worker thread should be recreated after encountering an error. Default value is `false`.

#### Method: `enqueue(payload: T)`

```typescript
enqueue(payload: T): Promise<R>
```

Enqueues a task represented by `payload` to be processed by the worker threads. The method returns a `Promise` that resolves to the result `R` of the executed task.

#### Method: `initialise()`

```typescript
async initialise(): Promise<void>
```

Initializes the worker queue by creating the necessary worker threads based on the `concurrency` value.
This method is optional and is called automatically when the first task is enqueued.
However, if creating a worker takes up some time,
it is recommended to call this method explicitly before enqueuing tasks to avoid any delays.

## Example

Here's a basic example that demonstrates the usage of `AsyncWorkerQueue`:

```typescript
import { AsyncWorkerQueue } from 'async-worker-queue';

// Function that creates a worker thread
const createWorker = (i: number): Promise<Execute<T, R>> => {
  // Create and return a worker thread
  // ...
};

// Create an instance of AsyncWorkerQueue
const workerQueue = new AsyncWorkerQueue(createWorker, 3);

// (Optional) Initialize the worker queue
await workerQueue.initialise();

// Enqueue tasks
const result1 = await workerQueue.enqueue(payload1);
const result2 = await workerQueue.enqueue(payload2);

console.log(result1, result2);
```

In this example, we create an instance of `AsyncWorkerQueue` with a concurrency of 3,
meaning that up to 3 tasks can be executed concurrently by the worker threads.
We then initialize the queue, enqueue tasks, and await their completion, printing the results.

## Contributing

Contributions are welcome! If you find a bug or have a suggestion for improvement,
please open a PR.
