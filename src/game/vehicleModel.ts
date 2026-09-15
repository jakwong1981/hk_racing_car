import * as THREE from 'three'

const prepareRoadVehicleModel = (model: THREE.Object3D, modelLength: number): THREE.Group => {
  model.updateMatrixWorld(true)
  const initialSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const normalizedModel = new THREE.Group()

  if (initialSize.x > initialSize.z) normalizedModel.rotation.y = Math.PI / 2
  normalizedModel.add(model)
  normalizedModel.updateMatrixWorld(true)

  const orientedSize = new THREE.Box3().setFromObject(normalizedModel).getSize(new THREE.Vector3())
  normalizedModel.scale.setScalar(modelLength / Math.max(orientedSize.x, orientedSize.z))
  normalizedModel.updateMatrixWorld(true)

  const scaledBox = new THREE.Box3().setFromObject(normalizedModel)
  const center = scaledBox.getCenter(new THREE.Vector3())
  normalizedModel.position.set(-center.x, -scaledBox.min.y, -center.z)

  const raceHeading = new THREE.Group()
  raceHeading.rotation.y = Math.PI
  raceHeading.add(normalizedModel)
  return raceHeading
}

export const prepareTaxiModel = (model: THREE.Object3D): THREE.Group => prepareRoadVehicleModel(model, 2.8)

export const prepareMinibusModel = (model: THREE.Object3D): THREE.Group => prepareRoadVehicleModel(model, 3.2)

export const prepareDoubleDeckerModel = (model: THREE.Object3D): THREE.Group => prepareRoadVehicleModel(model, 4.2)

export const prepareTramModel = (model: THREE.Object3D): THREE.Group => prepareRoadVehicleModel(model, 4.8)
