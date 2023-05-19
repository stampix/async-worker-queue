class Queue<T> {
  private _items: T[];
  constructor() {
    this._items = [];
  }
  enqueue(item: T) {
    this._items.push(item);
  }
  dequeue() {
    return this._items.shift();
  }
  get size() {
    return this._items.length;
  }
}
export type Execute<T, R> = (payload: T) => Promise<R>;
export interface Worker<T, R> {
  execute: Execute<T, R>;
  busy: boolean;
  index: number;
}
export class AsyncWorkerQueue<T, R> {
  private _queue = new Queue<{
    payload: T;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: unknown) => void;
  }>();
  private _workers = new Set<Worker<T, R>>();
  private _initialising = false;
  constructor(
    private _createWorker: (i: number) => Promise<Execute<T, R>>,
    public concurrency: number,
    private _options: {
      removeWorkerOnError?: boolean;
      recreateWorkerOnError?: boolean;
    } = {}
  ) {}

  /**
   * Initialised the queue if it hasn't been initialised yet.
   *
   * Use this to prematurely initialise the queue.
   * If not called, the queue will be initialised when the first task is enqueued.
   */
  public async initialise() {
    this._initialising = true;
    // Create all the workers by calling the createWorker function.
    // They should all be idle at first.
    for (let i = 0; i < this.concurrency; i++) {
      this._workers.add({
        execute: await this._createWorker(i),
        busy: false,
        index: i,
      });
      // As soon as the first worker is initialised, we can start processing tasks that are potentially already pending.
      if (this._workers.size === 1 && this._queue.size > 0) {
        void this.dequeue();
      }
    }
    this._initialising = false;
  }
  get initialised() {
    return this._workers.size > 0;
  }
  public enqueue(payload: T): Promise<R> {
    // If we haven't initialised yet, do so now.
    if (!this.initialised && !this._initialising) void this.initialise();
    return new Promise<R>((resolve, reject) => {
      this._queue.enqueue({ payload, resolve, reject });
      // Start processing a new task.
      void this.dequeue();
    });
  }
  /**
   * Returns the first free worker.
   * @private
   */
  private getFreeWorker() {
    return [...this._workers].find((worker) => !worker.busy);
  }
  private async dequeue() {
    // Do we have a free worker?
    const worker = this.getFreeWorker();
    // If not, return, we'll be called again when a worker is free.
    if (!worker) return;
    // Do we have a task?
    const task = this._queue.dequeue();
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
        this._options.removeWorkerOnError ||
        this._options.recreateWorkerOnError
      ) {
        this._workers.delete(worker);
      }
      if (this._options.recreateWorkerOnError) {
        this._workers.add({
          execute: await this._createWorker(worker.index),
          busy: false,
          index: worker.index,
        });
      }
      worker.busy = false;
      task.reject(e);
    } finally {
      void this.dequeue();
    }
  }
}
