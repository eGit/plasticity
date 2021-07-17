import { CompositeDisposable, Disposable } from "event-kit";
import * as THREE from "three";

// Time thresholds are in milliseconds, distance thresholds are in pixels.
const consummationTimeThreshold = 200; // once the mouse is down at least this long the drag is consummated
const consummationDistanceThreshold = 4; // once the mouse moves at least this distance the drag is consummated

type State = { tag: 'none' } | { tag: 'down', downEvent: PointerEvent, disposable: Disposable }

export default class Mouse2KeyboardEventManager {
    private state: State = { tag: 'none' };

    constructor(private readonly keymaps: AtomKeymap.KeymapManager) {
        document.addEventListener('keydown', event => {
            keymaps.handleKeyboardEvent(event);
        });
        document.addEventListener('pointerdown', event => {

        });
        document.addEventListener('wheel', event => {
            if (event.deltaY > 0) {
                // @ts-expect-error
                keymaps.handleKeyboardEvent(KeymapManager.buildKeydownEvent('wheel+up', event));
            } else {
                // @ts-expect-error
                keymaps.handleKeyboardEvent(KeymapManager.buildKeydownEvent('wheel+down', event));
            }
        });
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
    }

    onPointerMove(e: PointerEvent) { }

    onPointerDown(e: PointerEvent) {
        switch (this.state.tag) {
            case 'none':
                const disposables = new CompositeDisposable();

                document.addEventListener('pointerup', this.onPointerUp);
                disposables.add(new Disposable(() => window.removeEventListener('pointermove', this.onPointerMove)));
                disposables.add(new Disposable(() => window.removeEventListener('pointerup', this.onPointerUp)));
                this.state = { tag: 'down', downEvent: e, disposable: disposables };
                break;
            default: throw new Error('invalid state: ' + this.state.tag);
        }
    }

    onPointerUp(e: PointerEvent) {
        switch (this.state.tag) {
            case 'down': {
                const { downEvent, disposable } = this.state;
                if (e.pointerId !== downEvent.pointerId) return;
                if (e.button != 2) return;

                const currentPosition = new THREE.Vector2(e.clientX, e.clientY);
                const startPosition = new THREE.Vector2(downEvent.clientX, downEvent.clientY);
                const dragStartTime = downEvent.timeStamp;

                if (e.timeStamp - dragStartTime < consummationTimeThreshold &&
                    currentPosition.distanceTo(startPosition) < consummationDistanceThreshold
                ) {
                    // FIXME need to map ctrlKey->ctrl and fix the incorrect types.
                    // @ts-expect-error
                    keymaps.handleKeyboardEvent(KeymapManager.buildKeydownEvent('mouse2', e));
                }

                disposable.dispose();
                this.state = { tag: 'none' };

                break;
            }
            default: throw new Error('invalid state: ' + this.state.tag);
        }
    }
}