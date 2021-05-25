import { computed, watch, ref, reactive, nextTick, toRef, inject } from 'vue'
import {
  isArray,
  isFunction,
  isObject,
  isString,
  toRawType,
} from '@vue/shared'
import isEqual from 'lodash/isEqual'
import lodashDebounce from 'lodash/debounce'

import { UPDATE_MODEL_EVENT, CHANGE_EVENT } from '@element-plus/utils/constants'
import { isKorean } from '@element-plus/utils/isDef'
import { t } from '@element-plus/locale'
import { elFormKey, elFormItemKey } from '@element-plus/form'
import {
  getValueByPath,
  isIE,
  isEdge,
  isUndefined,
  useGlobalConfig,
} from '@element-plus/utils/util'

import { SelectProps } from './defaults'
import { flattenOptions } from './util'


import type { ExtractPropTypes } from 'vue'
import type { ElFormContext, ElFormItemContext } from '@element-plus/form'
import type { OptionType, Option } from './select.types'


const useSelect = (props: ExtractPropTypes<typeof SelectProps>, emit) => {

  // inject
  const elForm = inject(elFormKey, {} as ElFormContext)
  const elFormItem = inject(elFormItemKey, {} as ElFormItemContext)
  const $ELEMENT = useGlobalConfig()

  const states = reactive({
    cachedPlaceholder: '',
    createdOptions: [] as Option[],
    createdLabel: '',
    createdSelected: false,
    currentPlaceholder: '',
    hoveringIndex: -1,
    inputHovering: false,
    isOnComposition: false,
    isSilentBlur: false,
    inputLength: 20,
    inputWidth: 240,
    initialInputHeight: 0,
    previousQuery: null,
    query: '',
    selectedLabel: '',
  })

  // data refs
  const selected = ref<any | Array<any>>([])
  const filteredOptions = ref([])

  // DOM & Component refs
  const controlRef = ref(null)
  const hiddenInputRef = ref(null)
  const inputRef = ref(null) // el-input ref
  const popperRef = ref(null)
  const selectRef = ref(null)
  const tagsRef = ref(null) // tags ref

  // the controller of the expanded popup
  const expanded = ref(false)

  const selectDisabled = computed(() => props.disabled || elForm.disabled)

  const showClearBtn = computed(() => {
    const hasValue = props.multiple
      ? Array.isArray(props.modelValue) && props.modelValue.length > 0
      : props.modelValue !== undefined && props.modelValue !== null && props.modelValue !== ''

    const criteria =
      props.clearable &&
      !selectDisabled.value &&
      states.inputHovering &&
      hasValue
    return criteria
  })

  const iconClass = computed(() => props.remote && props.filterable ? '' : (expanded.value ? 'arrow-up is-reverse' : 'arrow-up'))

  const debounce = computed(() => props.remote ? 300 : 0)

  // filteredOptions includes flatten the data into one dimensional array.
  const emptyText = computed(() => {
    const options = filteredOptions.value
    if (props.loading) {
      return props.loadingText || t('el.select.loading')
    } else {
      if (props.remote && states.query === '' && options.length === 0) return false
      if (props.filterable && states.query && options.length > 0) {
        return props.noMatchText || t('el.select.noMatch')
      }
      if (options.length === 0) {
        return props.noDataText || t('el.select.noData')
      }
    }
    return null
  })

  const selectSize = computed(() => props.size || elFormItem.size || $ELEMENT.size)

  const collapseTagSize = computed(() => ['small', 'mini'].indexOf(selectSize.value) > -1 ? 'mini' : 'small')

  const readonly = computed(() => !props.filterable || props.multiple || (!isIE() && !isEdge() && !expanded.value))


  // methods
  const toggleMenu = () => {
    if (props.automaticDropdown) return
    if (!selectDisabled.value) {
      // if (states.menuVisibleOnFocus) {
      //   states.menuVisibleOnFocus = false
      // } else {
      expanded.value = !expanded.value
      // }
      if (expanded.value) {
        (hiddenInputRef.value || inputRef.value).focus()
      }
    }
  }

  const handleQueryChange = (val: string) => {
    if (states.previousQuery === val || states.isOnComposition) return
    if (
      states.previousQuery === null &&
      (isFunction(props.filterMethod) || isFunction(props.remoteMethod))
    ) {
      states.previousQuery = val
      return
    }
    states.previousQuery = val
    nextTick(() => {
      if (expanded.value) popperRef.value?.update?.()
    })
    states.hoveringIndex = -1
    if (props.multiple && props.filterable) {
      nextTick(() => {
        const length = hiddenInputRef.value.length * 15 + 20
        states.inputLength = props.collapseTags ? Math.min(50, length) : length
        managePlaceholder()
        resetInputHeight()
      })
    }
    if (props.remote && isFunction(props.remoteMethod)) {
      states.hoveringIndex = -1
      props.remoteMethod(val)
    } else if (isFunction(props.filterMethod)) {
      props.filterMethod(val)
      // states.selectEmitter.emit('elOptionGroupQueryChange')
    } else {
      // states.selectEmitter.emit('elOptionQueryChange', val)
      // states.selectEmitter.emit('elOptionGroupQueryChange')
    }
    if (props.defaultFirstOption && (props.filterable || props.remote)) {
      // checkDefaultFirstOption()
    }
  }

  const handleComposition = event => {
    const text = event.target.value
    if (event.type === 'compositionend') {
      states.isOnComposition = false
      nextTick(() => handleQueryChange(text))
    } else {
      const lastCharacter = text[text.length - 1] || ''
      states.isOnComposition = !isKorean(lastCharacter)
    }
  }

  const onInputChange = () => {
    if (props.filterable && states.query !== states.selectedLabel) {
      states.query = states.selectedLabel
      handleQueryChange(states.query)
    }
  }

  const debouncedOnInputChange = lodashDebounce(() => {
    onInputChange()
  }, debounce.value)

  const debouncedQueryChange = lodashDebounce(e => {
    handleQueryChange(e.target.value)
  }, debounce.value)

  const emitChange = val => {
    if (!isEqual(props.modelValue, val)) {
      emit(CHANGE_EVENT, val)
    }
  }

  const managePlaceholder = () => {
    if (states.currentPlaceholder !== '') {
      states.currentPlaceholder = inputRef.value.value ? '' : states.cachedPlaceholder
    }
  }

  const checkDefaultFirstOption = () => {
    // states.hoveringIndex = -1
    // // highlight the created option
    // let hasCreated = false
    // for (let i = states.options.size - 1; i >= 0; i--) {
    //   if (optionsArray.value[i].created) {
    //     hasCreated = true
    //     states.hoveringIndex = i
    //     break
    //   }
    // }
    // if (hasCreated) return
    // for (let i = 0; i !== states.options.size; ++i) {
    //   const option = optionsArray.value[i]
    //   if (states.query) {
    //     // highlight first options that passes the filter
    //     if (!option.disabled && !option.groupDisabled && option.visible) {
    //       states.hoveringIndex = i
    //       break
    //     }
    //   } else {
    //     // highlight currently selected option
    //     if (option.itemSelected) {
    //       states.hoveringIndex = i
    //       break
    //     }
    //   }
    // }
  }

  const setSelected = () => {
    if (!props.multiple) {
      const option = getOption(props.modelValue)
      if (option.props?.created) {
        states.createdLabel = option.value
        states.createdSelected = true
      } else {
        states.createdSelected = false
      }
      states.selectedLabel = option.currentLabel
      selected.value = option
      if (props.filterable) states.query = states.selectedLabel
      return
    }
    const result = []
    if (Array.isArray(props.modelValue)) {
      props.modelValue.forEach(value => {
        result.push(getOption(value))
      })
    }
    selected.value = result
    nextTick(() => {
      resetInputHeight()
    })
  }

  const getOption = value => {
    let option
    const isObjectValue = toRawType(value).toLowerCase() === 'object'
    const isNull = toRawType(value).toLowerCase() === 'null'
    const isUndefined = toRawType(value).toLowerCase() === 'undefined'

    for (let i = states.cachedOptions.size - 1; i >= 0; i--) {
      const cachedOption = cachedOptionsArray.value[i]
      const isEqualValue = isObjectValue
        ? getValueByPath(cachedOption.value, props.valueKey) === getValueByPath(value, props.valueKey)
        : cachedOption.value === value
      if (isEqualValue) {
        option = {
          value,
          label: cachedOption.currentLabel,
          isDisabled: cachedOption.isDisabled,
        }
        break
      }
    }
    if (option) return option
    const label = (!isObjectValue && !isNull && !isUndefined) ? value : ''
    const newOption = {
      value,
      label: label,
    }
    if (props.multiple) {
      (newOption as any).hitState = false
    }
    return newOption
  }

  const getValueIndex = (arr = [], value: unknown) => {
    if (!isObject(value)) return arr.indexOf(value)

    const valueKey = props.valueKey
    let index = -1
    arr.some((item, i) => {
      if (getValueByPath(item, valueKey) === getValueByPath(value, valueKey)) {
        index = i
        return true
      }
      return false
    })
    return index
  }

  const resetInputHeight = () => {
    if (props.collapseTags && !props.filterable) return
    nextTick(() => {
      if (!inputRef.value) return
      const inputChildNodes = inputRef.value.$el.childNodes
      const input = [].filter.call(inputChildNodes, item => item.tagName === 'INPUT')[0]
      const _tags = tagsRef.value
      const sizeInMap = states.initialInputHeight || 40
      input.style.height = selected.value.length === 0
        ? sizeInMap + 'px'
        : Math.max(
          _tags ? (_tags.clientHeight + (_tags.clientHeight > sizeInMap ? 6 : 0)) : 0,
          sizeInMap) + 'px'

      states.tagInMultiLine = parseFloat(input.style.height) > sizeInMap

      if (expanded.value && emptyText.value !== false) {
        popperRef.value?.update?.()
      }
    })
  }

  const resetHoverIndex = () => {
    setTimeout(() => {
      if (!props.multiple) {
        states.hoveringIndex = filteredOptions.value.indexOf(selected.value)
      } else {
        if (selected.value.length > 0) {
          states.hoveringIndex = Math.min.apply(null, selected.value.map(item => filteredOptions.value.indexOf(item)))
        } else {
          states.hoveringIndex = -1
        }
      }
    }, 300)
  }

  const handleResize = () => {
    resetInputWidth()
    popperRef.value?.update?.()
    if (props.multiple) resetInputHeight()
  }

  const resetInputWidth = () => {
    states.inputWidth = inputRef.value?.$el.getBoundingClientRect().width
  }

  const onSelect = (option: Option, byClick = true) => {
    if (props.multiple) {
      let selectedOptions = (props.modelValue as any[]).slice()
      const index = getValueIndex(selectedOptions, option.value)
      if (index > -1) {
        selectedOptions = [
          ...selectedOptions.slice(0, index),
          ...selectedOptions.slice(index + 1),
        ]
      } else if (props.multipleLimit <= 0 || selectedOptions.length < props.multipleLimit) {
        selectedOptions = [...selectedOptions, option.value]
      }
      emit(UPDATE_MODEL_EVENT, selectedOptions)
      emitChange(selectedOptions)
      if (option.created) {
        states.query = ''
        handleQueryChange('')
        states.inputLength = 20
      }
      if (props.filterable) inputRef.value.focus()
    } else {
      emit(UPDATE_MODEL_EVENT, option.value)
      emitChange(option.value)
      expanded.value = false
    }
    states.isSilentBlur = byClick
    // setSoftFocus()
    if (expanded.value) return
    nextTick(() => {
      // scrollToOption(option)
    })
  }

  const deletePrevTag = e => {
    if (e.target.value.length <= 0 && !toggleLastOptionHitState()) {
      const value = (props.modelValue as Array<unknown>).slice()
      value.pop()
      emit(UPDATE_MODEL_EVENT, value)
      emitChange(value)
    }

    if (e.target.value.length === 1 && (props.modelValue as Array<unknown>).length === 0) {
      states.currentPlaceholder = states.cachedPlaceholder
    }
  }

  const deleteTag = (event, tag) => {
    const index = selected.value.indexOf(tag)
    if (index > -1 && !selectDisabled.value) {
      const value = [
        ...(props.modelValue as Array<unknown>).slice(0, index),
        ...(props.modelValue as Array<unknown>).slice(index + 1),
      ]
      emit(UPDATE_MODEL_EVENT, value)
      emitChange(value)
      emit('remove-tag', tag.value)
    }
    event.stopPropagation()
  }

  const deleteSelected = event => {
    event.stopPropagation()
    const value = props.multiple ? [] : ''
    if (!isString(value)) {
      for (const item of selected.value) {
        if (item.isDisabled) value.push(item.value)
      }
    }
    emit(UPDATE_MODEL_EVENT, value)
    emitChange(value)
    expanded.value = false
    emit('clear')
  }

  const handleMenuEnter = () => {
    // nextTick(() => scrollToOption(selected.value))
  }

  // in order to track these individually, we need to turn them into refs instead of watching the entire
  // reactive object which could cause perf penalty when unnecessary field gets changed the watch method will
  // be invoked.
  const optionsRef = toRef(props, 'options')
  const queryRef = toRef(states, 'query')

  watch([optionsRef, queryRef], ([options, query]) => {

    const isValidOption = (o: Option): boolean => {
      // fill the conditions here.
      return true
    }

    filteredOptions.value = flattenOptions((options as OptionType[]).concat(states.createdOptions).map(v => {
      if (isArray(v.options)) {
        const filtered = v.options.filter(isValidOption)
        if (filtered.length > 0) {
          return {
            ...v,
            options: filtered,
          }
        }
      } else {
        if (isValidOption(v as Option)) {
          return v
        }
      }
      return null
    }).filter(v => v !== null))

  }, { immediate: true })

  return {
    // data exports
    collapseTagSize,
    expanded,
    emptyText,
    debounce,
    filteredOptions,
    iconClass,
    readonly,
    selectDisabled,
    selected,
    selectSize,
    showClearBtn,
    states,

    // refs items exports
    controlRef,
    hiddenInputRef,
    inputRef,
    popperRef,
    selectRef,
    tagsRef,

    // methods exports
    toggleMenu,
    onSelect,
  }
}

export default useSelect
