// erratas' part of the nexitas shell: its name, icon and hue, and its section in the nav. A
// project sets it up on its Errors page.
export default defineAppConfig({
  nexitas: {
    modules: [
      {
        id: 'erratas',
        label: 'Errors',
        description: 'What breaks in your apps, grouped into issues, with the stack trace.',
        icon: 'bug',
        accent: 'pink',
      },
    ],
    nav: [{ to: '/errors', label: 'Errors', module: 'erratas' }],
  },
})
