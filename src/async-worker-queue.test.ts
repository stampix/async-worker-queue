import { expect, test } from "vitest";
import AsyncWorkerQueue from "./async-worker-queue";

test("Should have a concurrency of at least 1", () => {
  expect(
    () =>
      new AsyncWorkerQueue<number, number>(() => {
        throw new Error("Unreachable");
      }, 0)
  ).toThrow("Concurrency must be greater than 0");
});

test("Should process a payload", async () => {
  const queue = new AsyncWorkerQueue(() => {
    return {
      execute: (payload: number) => {
        return payload + 1;
      },
      dispose: () => void 0,
    };
  }, 1);
  await expect(queue.enqueue(1)).resolves.toEqual(2);
  await expect(queue.enqueue(6)).resolves.toEqual(7);
});

test("Should throw an error if no workers got created in the first place", async () => {
  const queue = new AsyncWorkerQueue<number, number>(() => {
    throw new Error("Could not create worker");
  }, 1);
  await expect(queue.enqueue(1)).rejects.toThrow("No available workers");
});

test("Should work if at least some workers got created", async () => {
  // Here, no workers get created because the first worker already fails to create
  let queue = new AsyncWorkerQueue<number, number>((i) => {
    if (i === 0) throw new Error("Could not create worker");
    return {
      execute: (payload: number) => {
        return payload + 1;
      },
      dispose: () => void 0,
    };
  }, 2);
  await expect(queue.enqueue(1)).rejects.toThrow("No available workers");
  // Here, we do allow one to be made and only error out later
  queue = new AsyncWorkerQueue<number, number>((i) => {
    if (i === 1) throw new Error("Could not create worker");
    return {
      execute: (payload: number) => {
        return payload + 1;
      },
      dispose: () => void 0,
    };
  }, 2);
  await expect(queue.enqueue(1)).resolves.toEqual(2);
});

test("Should process a payload, even if all tasks before failed", async () => {
  const queue = new AsyncWorkerQueue<number, number>(() => {
    return {
      execute: (idx: number) => {
        if (idx < 5) throw new Error("Fail");
        return idx;
      },
      dispose: () => void 0,
    };
  }, 5);
  // Push 5 tasks through, which will all fail
  for (let i = 0; i < 5; i++) {
    await expect(queue.enqueue(i)).rejects.toThrow("Fail");
  }
  await expect(queue.enqueue(6)).resolves.toEqual(6);
});

test("Should fail if no workers are available because they all got disposed", async () => {
  const queue = new AsyncWorkerQueue<number, number>(
    () => {
      return {
        execute: (idx: number) => {
          if (idx < 5) throw new Error("Fail");
          return idx;
        },
        dispose: () => void 0,
      };
    },
    5,
    {
      removeWorkerOnError: true,
    }
  );
  // Push 5 tasks through, which will all fail
  for (let i = 0; i < 5; i++) {
    await expect(queue.enqueue(i)).rejects.toThrow("Fail");
  }
  await expect(queue.enqueue(6)).rejects.toThrow("No available workers");
});

test("Should recreate workers and therefore not care if anything fails", async () => {
  const queue = new AsyncWorkerQueue<number, number>(
    () => {
      return {
        execute: (idx: number) => {
          if (idx < 5) throw new Error("Fail");
          return idx;
        },
        dispose: () => void 0,
      };
    },
    5,
    {
      removeWorkerOnError: true,
      recreateWorkerOnError: true,
    }
  );
  // Push 5 tasks through, which will all fail
  for (let i = 0; i < 5; i++) {
    await expect(queue.enqueue(i)).rejects.toThrow("Fail");
  }
  await expect(queue.enqueue(6)).resolves.toEqual(6);
});
