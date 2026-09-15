import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { prepareDoubleDeckerModel, prepareMinibusModel, prepareTaxiModel, prepareTramModel } from './vehicleModel'

describe('road vehicle models', () => {
  it.each([
    { name: 'taxi', prepare: prepareTaxiModel, expectedLength: 2.8 },
    { name: 'minibus', prepare: prepareMinibusModel, expectedLength: 3.2 },
    { name: 'double-decker', prepare: prepareDoubleDeckerModel, expectedLength: 4.2 },
    { name: 'tram', prepare: prepareTramModel, expectedLength: 4.8 },
  ])('preserves the $name FBX axis conversion while applying the race heading', ({ prepare, expectedLength }) => {
    const model = new THREE.Group()
    model.rotation.x = -Math.PI / 2
    model.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1)))

    const preparedModel = prepare(model)
    preparedModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(preparedModel)
    const size = bounds.getSize(new THREE.Vector3())

    expect(model.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(model.rotation.y).toBeCloseTo(0)
    expect(model.rotation.z).toBeCloseTo(0)
    expect(preparedModel.rotation.y).toBeCloseTo(Math.PI)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(Math.max(size.x, size.z)).toBeCloseTo(expectedLength)
  })
})
