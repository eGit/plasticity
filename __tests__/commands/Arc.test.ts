import * as THREE from "three";
import { CenterPointArcFactory } from "../../src/commands/arc/ArcFactory";
import { EditorSignals } from '../../src/Editor';
import { GeometryDatabase } from '../../src/GeometryDatabase';
import MaterialDatabase from '../../src/MaterialDatabase';
import * as visual from '../../src/VisualModel';
import { FakeMaterials } from "../../__mocks__/FakeMaterials";
import FakeSignals from '../../__mocks__/FakeSignals';
import '../matchers';

let db: GeometryDatabase;
let materials: Required<MaterialDatabase>;
let signals: EditorSignals;

beforeEach(() => {
    materials = new FakeMaterials();
    signals = FakeSignals();
    db = new GeometryDatabase(materials, signals);
})

describe(CenterPointArcFactory, () => {
    let makeArc: CenterPointArcFactory;

    beforeEach(() => {
        makeArc = new CenterPointArcFactory(db, materials, signals);
    })

    test('commit', async () => {
        makeArc.center = new THREE.Vector3();
        makeArc.p2 = new THREE.Vector3(-1, 0, 0);
        makeArc.p3 = new THREE.Vector3(0, 1, 0);
        const item = await makeArc.commit() as visual.Item;
        const bbox = new THREE.Box3().setFromObject(item);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        expect(center).toApproximatelyEqual(new THREE.Vector3(-0.5, 0.5, 0));
        expect(bbox.min).toApproximatelyEqual(new THREE.Vector3(-1, 0, 0));
        expect(bbox.max).toApproximatelyEqual(new THREE.Vector3(0, 1, 0));
    });

})