import time


def run_once() -> None:
    # Placeholder for queue integration.
    print("worker heartbeat")


if __name__ == "__main__":
    while True:
        run_once()
        time.sleep(5)
