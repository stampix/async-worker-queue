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
export type Execute<T, R> = (payload: T) => Promise<R>;
export interface Worker<T, R> {
  execute: Execute<T, R>;
  busy: boolean;
  index: number;
}
export interface AsyncWorkerQueueOptions {
  removeWorkerOnError?: boolean;
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
  #createWorker: (i: number) => Promise<Execute<T, R>>;
  #options: AsyncWorkerQueueOptions;
  constructor(
    createWorker: (i: number) => Promise<Execute<T, R>>,
    public concurrency: number,
    options: AsyncWorkerQueueOptions = {}
  ) {
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
    this.#initialising = true;
    // Create all the workers by calling the createWorker function.
    // They should all be idle at first.
    for (let i = 0; i < this.concurrency; i++) {
      this.#workers.add({
        execute: await this.#createWorker(i),
        busy: false,
        index: i,
      });
      // As soon as the first worker is initialised, we can start processing tasks that are potentially already pending.
      if (this.#workers.size === 1 && this.#queue.size > 0) {
        void this.#dequeue();
      }
    }
    this.#initialising = false;
  }
  get initialised() {
    return this.#workers.size > 0;
  }
  public enqueue(payload: T): Promise<R> {
    // If we haven't initialised yet, do so now.
    if (!this.initialised && !this.#initialising) void this.initialise();
    return new Promise<R>((resolve, reject) => {
      this.#queue.enqueue({ payload, resolve, reject });
      // Start processing a new task.
      void this.#dequeue();
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
        this.#workers.delete(worker);
      }
      if (this.#options.recreateWorkerOnError) {
        this.#workers.add({
          execute: await this.#createWorker(worker.index),
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
}
