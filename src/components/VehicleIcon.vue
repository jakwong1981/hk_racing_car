<script setup lang="ts">
import type { VehicleId } from '../types/game'
defineProps<{ vehicle: VehicleId }>()
</script>
<template><span class="vehicle-icon" :class="vehicle" aria-hidden="true"><i></i><b></b><em></em></span></template>
