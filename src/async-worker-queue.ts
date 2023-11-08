class Queue<T> {
  #items: T[];
  constructor() {
    this.#items = [];
  }
  enqueue(item: T) {
    this.#items.push(item);
  }
  dequeue() {
    return this.#items.shift();
  }
  get size() {
    return this.#items.length;
  }
}
export type Execute<T, R> = (payload: T) => Promise<R> | R;
export type Dispose = () => Promise<void> | void;
export interface CreateWorkerResult<T, R> {
  execute: Execute<T, R>;
  dispose: Dispose;
}
export interface Worker<T, R> {
  execute: Execute<T, R>;
  dispose: Dispose;
  busy: boolean;
  index: number;
}
export interface AsyncWorkerQueueOptions {
  /**
   * If true, the worker will be removed from the list of workers when it errors.
   * It will also dispose the worker.
   * No new worker will be created to replace it, unless `recreateWorkerOnError` is also set to true.
   */
  removeWorkerOnError?: boolean;
  /**
   * If true, the worker will be recreated when it errors.
   * The original worker will remain unless `removeWorkerOnError` is also set to true.
   */
  recreateWorkerOnError?: boolean;
}
export class AsyncWorkerQueue<T, R> {
  #queue = new Queue<{
    payload: T;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: unknown) => void;
  }>();
  #workers = new Set<Worker<T, R>>();
  #initialising = false;
  #initialised = false;
  readonly #createWorker: (
    i: number
  ) => Promise<CreateWorkerResult<T, R>> | CreateWorkerResult<T, R>;
  #options: AsyncWorkerQueueOptions;

  /**
   * Creates a new AsyncWorkerQueue.
   * @param createWorker A function that creates a worker.
   * @param concurrency The number of concurrent workers to use.
   * @param options Options for the queue.
   */
  constructor(
    createWorker: (
      i: number
    ) => Promise<CreateWorkerResult<T, R>> | CreateWorkerResult<T, R>,
    public concurrency: number,
    options: AsyncWorkerQueueOptions = {}
  ) {
    if (concurrency < 1) throw new Error("Concurrency must be greater than 0");
    this.#createWorker = createWorker;
    this.#options = options;
  }

  /**
   * Initialised the queue if it hasn't been initialised yet.
   *
   * Use this to prematurely initialise the queue.
   * If not called, the queue will be initialised when the first task is enqueued.
   */
  public async initialise() {
    if (this.#initialised) return;
    this.#initialising = true;
    // Create all the workers by calling the createWorker function.
    // They should all be idle at first.
    for (let i = 0; i < this.concurrency; i++) {
      const worker = await this.#createWorker(i);
      this.#workers.add({
        execute: worker.execute,
        dispose: worker.dispose,
        busy: false,
        index: i,
      });
      // As soon as the first worker is initialised, we can start processing tasks that are potentially already pending.
      if (this.#workers.size === 1 && this.#queue.size > 0) {
        void this.#dequeue();
      }
    }
    this.#initialising = false;
    this.#initialised = true;
  }
  public async enqueue(payload: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      // If we haven't initialised yet, do so now.
      if (!this.#initialised && !this.#initialising) {
        void this.initialise().catch(() => {
          // If we initialised but errors were thrown, we might not have any workers,
          // reject the promise because we cannot process this payload.
          if (this.#workers.size === 0) {
            reject(new Error("No available workers"));
          }
        });
      } else {
        // If we are initialised, but have no workers, reject the promise because we cannot process this payload.
        if (this.#workers.size === 0) {
          reject(new Error("No available workers"));
        }
      }
      this.#queue.enqueue({ payload, resolve, reject });
      // Start processing a new task if we have any workers already (i.e. initialised)
      if (this.#workers.size > 0) {
        void this.#dequeue();
      }
    });
  }
  /**
   * Returns the first free worker.
   * @private
   */
  #getFreeWorker() {
    return [...this.#workers].find((worker) => !worker.busy);
  }
  async #dequeue() {
    // Do we have a free worker?
    const worker = this.#getFreeWorker();
    // If not, return, we'll be called again when a worker is free.
    if (!worker) return;
    // Do we have a task?
    const task = this.#queue.dequeue();
    // If not, return, we'll be called again when a task is available.
    if (!task) return;
    try {
      worker.busy = true;
      const result = await worker.execute(task.payload);
      worker.busy = false;
      task.resolve(result);
    } catch (e) {
      // If the worker errored, remove it from the list of workers.
      if (
        this.#options.removeWorkerOnError ||
        this.#options.recreateWorkerOnError
      ) {
        // Dispose it first, so it can clean up any resources it might be using.
        await worker.dispose();
        this.#workers.delete(worker);
      }
      if (this.#options.recreateWorkerOnError) {
        const newWorker = await this.#createWorker(worker.index);
        this.#workers.add({
          execute: newWorker.execute,
          dispose: newWorker.dispose,
          busy: false,
          index: worker.index,
        });
      }
      worker.busy = false;
      task.reject(e);
    } finally {
      void this.#dequeue();
    }
  }

  /**
   * Destroys the queue and all workers.
   *
   * You should not use this queue after calling this function.
   */
  async dispose() {
    for (const worker of this.#workers) {
      await worker.dispose();
    }
    this.#workers = new Set<Worker<T, R>>();
    this.#queue = new Queue<{
      payload: T;
      resolve: (value: R | PromiseLike<R>) => void;
      reject: (reason?: unknown) => void;
    }>();
  }
}

export default AsyncWorkerQueue;
