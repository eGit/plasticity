import * as THREE from "three";
import { SymmetryFactory } from "../commands/mirror/MirrorFactory";
import { EditorSignals } from "./EditorSignals";
import { Agent, DatabaseLike, GeometryDatabase, MaterialOverride, TemporaryObject } from "./GeometryDatabase";
import MaterialDatabase from "./MaterialDatabase";
import * as visual from "./VisualModel";
import c3d from '../../build/Release/c3d.node';

export type Replacement = { from: visual.Item, to: visual.Item }

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

class ModifierList {
    private last?: visual.Solid;
    private temp?: TemporaryObject;

    constructor(
        private readonly db: GeometryDatabase,
        private readonly materials: MaterialDatabase,
        private readonly signals: EditorSignals,
    ) { }

    async update(underlying: c3d.Solid, view: Promise<visual.Solid>) {
        const symmetry = new SymmetryFactory(this.db, this.materials, this.signals);
        symmetry.solid = underlying;
        symmetry.origin = new THREE.Vector3();
        symmetry.orientation = new THREE.Quaternion().setFromUnitVectors(X, Z);
        console.time("calculate");
        const symmetrized = await symmetry.calculate();
        console.timeEnd("calculate");

        const modified = (this.last !== undefined) ?
            await this.db.replaceItem(this.last, symmetrized) :
            await this.db.addItem(symmetrized, 'automatic');

        const unmodified = await view;
        modified.bemodify(unmodified);
        unmodified.premodify(modified);

        this.last = modified;
    }

    async tempf(from: visual.Item, underlying: c3d.Solid) {
        this.db.hide(from);
        
        const symmetry = new SymmetryFactory(this.db, this.materials, this.signals);
        symmetry.solid = underlying;
        symmetry.origin = new THREE.Vector3();
        symmetry.orientation = new THREE.Quaternion().setFromUnitVectors(X, Z);
        console.time("calculate");
        const symmetrized = await symmetry.calculate();
        console.timeEnd("calculate");

        const result = (this.last !== undefined) ?
            await this.db.replaceTemporaryItem(this.last, symmetrized) :
            await this.db.addTemporaryItem(symmetrized);
        if (this.temp !== undefined) this.temp.cancel();

        result.show();
        this.temp = result;
        return result;
    }
}

export class ModifierManager implements DatabaseLike {
    private readonly map = new Map<c3d.SimpleName, ModifierList>();
    private readonly version2name = new Map<c3d.SimpleName, c3d.SimpleName>();

    constructor(
        private readonly db: GeometryDatabase,
        private readonly materials: MaterialDatabase,
        private readonly signals: EditorSignals
    ) { }

    async add(object: visual.Solid) {
        const name = this.version2name.get(object.simpleName)!;

        const modifiers = new ModifierList(this.db, this.materials, this.signals);
        this.map.set(name, modifiers);

        return modifiers.update(this.db.lookup(object), Promise.resolve(object));
    }

    async addItem(model: c3d.Solid, agent?: Agent): Promise<visual.Solid>;
    async addItem(model: c3d.SpaceInstance, agent?: Agent): Promise<visual.SpaceInstance<visual.Curve3D>>;
    async addItem(model: c3d.PlaneInstance, agent?: Agent): Promise<visual.PlaneInstance<visual.Region>>;
    async addItem(model: c3d.Item, agent: Agent = 'user'): Promise<visual.Item> {
        const result = await this.db.addItem(model, agent);
        this.version2name.set(result.simpleName, result.simpleName);
        return result;
    }

    async replaceItem(from: visual.Solid, model: c3d.Solid, agent?: Agent): Promise<visual.Solid>;
    async replaceItem<T extends visual.SpaceItem>(from: visual.SpaceInstance<T>, model: c3d.SpaceInstance, agent?: Agent): Promise<visual.SpaceInstance<visual.Curve3D>>;
    async replaceItem<T extends visual.PlaneItem>(from: visual.PlaneInstance<T>, model: c3d.PlaneInstance, agent?: Agent): Promise<visual.PlaneInstance<visual.Region>>;
    async replaceItem(from: visual.Item, model: c3d.Item, agent?: Agent): Promise<visual.Item>;
    async replaceItem(from: visual.Item, to: c3d.Item): Promise<visual.Item> {
        const { map, version2name } = this;
        const name = version2name.get(from.simpleName)!;

        const result = this.db.replaceItem(from, to);
        if (map.has(name)) {
            const modifiers = map.get(name)!;
            await modifiers.update(to as c3d.Solid, result as Promise<visual.Solid>);
        }

        const view = await result;

        version2name.delete(from.simpleName);
        this.version2name.set(view.simpleName, name);

        return result;
    }

    removeItem(view: visual.Item, agent?: Agent): void {
        const { version2name } = this;

        this.db.removeItem(view, agent);
        version2name.delete(view.simpleName)!;
    }

    async duplicate(model: visual.Solid): Promise<visual.Solid>;
    async duplicate<T extends visual.SpaceItem>(model: visual.SpaceInstance<T>): Promise<visual.SpaceInstance<T>>;
    async duplicate<T extends visual.PlaneItem>(model: visual.PlaneInstance<T>): Promise<visual.PlaneInstance<T>>;
    async duplicate(item: visual.Item): Promise<visual.Item> {
        // @ts-expect-error('typescript cant type polymorphism like this')
        const result = await this.db.duplicate(item);
        this.version2name.set(result.simpleName, result.simpleName);
        return result;
    }

    addPhantom(object: c3d.Item, materials?: MaterialOverride): Promise<TemporaryObject> {
        return this.db.addPhantom(object, materials);
    }

    addTemporaryItem(object: c3d.Item): Promise<TemporaryObject> {
        return this.db.addTemporaryItem(object);
    }

    async replaceTemporaryItem(from: visual.Item, to: c3d.Item): Promise<TemporaryObject> {
        const { map, version2name } = this;
        const name = version2name.get(from.simpleName)!;

        let result: TemporaryObject;
        if (map.has(name)) {
            const modifiers = map.get(name)!;
            result = await modifiers.tempf(from, to as c3d.Solid);
        } else {
            result = await this.db.replaceTemporaryItem(from, to);
        }

        return result;
    }


    lookup(object: visual.Solid): c3d.Solid;
    lookup(object: visual.SpaceInstance<visual.Curve3D>): c3d.SpaceInstance;
    lookup(object: visual.PlaneInstance<visual.Region>): c3d.PlaneInstance;
    lookup(object: visual.Item): c3d.Item;
    lookup(object: visual.Item): c3d.Item {
        return this.db.lookup(object);
    }

    lookupTopologyItem(object: visual.Face): c3d.Face;
    lookupTopologyItem(object: visual.CurveEdge): c3d.CurveEdge;
    lookupTopologyItem(object: visual.Edge | visual.Face): c3d.TopologyItem {
        // @ts-expect-error('typescript cant type polymorphism like this')
        return this.db.lookupTopologyItem(object);
    }

    hide(item: visual.Item): void {
        return this.db.hide(item);
    }

    unhide(item: visual.Item): void {
        return this.db.unhide(item);
    }

}