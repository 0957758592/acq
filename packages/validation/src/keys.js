export const validationKeys = {
  common: {
    required: 'validation.required',
    email: 'validation.email',
    min: 'validation.min',
    url: 'validation.url',
    match: 'validation.match',
    json: 'validation.json',
    oneOf: 'validation.oneOf',
    arrayMin: 'validation.arrayMin'
  },
  auth: {
    login: {
      email: {
        required: 'validation.auth.login.email.required',
        invalid: 'validation.auth.login.email.invalid'
      },
      password: {
        required: 'validation.auth.login.password.required',
        min: 'validation.auth.login.password.min'
      }
    }
  },
  users: {
    name: {
      required: 'validation.users.name.required'
    },
    email: {
      required: 'validation.users.email.required',
      invalid: 'validation.users.email.invalid'
    },
    password: {
      required: 'validation.users.password.required',
      min: 'validation.users.password.min'
    },
    avatarUrl: {
      invalid: 'validation.users.avatarUrl.invalid'
    },
    role: {
      required: 'validation.users.role.required'
    }
  },
  settings: {
    profile: {
      name: {
        required: 'validation.settings.profile.name.required'
      },
      email: {
        required: 'validation.settings.profile.email.required',
        invalid: 'validation.settings.profile.email.invalid'
      },
      avatarUrl: {
        invalid: 'validation.settings.profile.avatarUrl.invalid'
      }
    },
    password: {
      currentPassword: {
        required: 'validation.settings.password.currentPassword.required'
      },
      newPassword: {
        required: 'validation.settings.password.newPassword.required',
        min: 'validation.settings.password.newPassword.min'
      },
      confirmPassword: {
        required: 'validation.settings.password.confirmPassword.required',
        match: 'validation.settings.password.confirmPassword.match'
      }
    }
  },
  blog: {
    author: {
      name: {
        required: 'validation.blog.author.name.required'
      },
      slug: {
        required: 'validation.blog.author.slug.required'
      },
      avatarUrl: {
        invalid: 'validation.blog.author.avatarUrl.invalid'
      }
    },
    category: {
      name: {
        required: 'validation.blog.category.name.required'
      },
      slug: {
        required: 'validation.blog.category.slug.required'
      }
    },
    post: {
      title: {
        required: 'validation.blog.post.title.required'
      },
      slug: {
        required: 'validation.blog.post.slug.required'
      },
      status: {
        required: 'validation.blog.post.status.required'
      },
      publishAt: {
        required: 'validation.blog.post.publishAt.required'
      },
      language: {
        required: 'validation.blog.post.language.required'
      },
      coverImageUrl: {
        invalid: 'validation.blog.post.coverImageUrl.invalid'
      },
      canonicalUrl: {
        invalid: 'validation.blog.post.canonicalUrl.invalid'
      },
      ogImageUrl: {
        invalid: 'validation.blog.post.ogImageUrl.invalid'
      },
      twitterImageUrl: {
        invalid: 'validation.blog.post.twitterImageUrl.invalid'
      },
      structuredDataJson: {
        invalid: 'validation.blog.post.structuredDataJson.invalid'
      },
      hreflangUrl: {
        invalid: 'validation.blog.post.hreflangUrl.invalid'
      }
    }
  },
  events: {
    event: {
      title: {
        required: 'validation.events.event.title.required'
      },
      slug: {
        required: 'validation.events.event.slug.required'
      },
      startAt: {
        required: 'validation.events.event.startAt.required'
      },
      endAt: {
        required: 'validation.events.event.endAt.required'
      },
      status: {
        required: 'validation.events.event.status.required'
      },
      publishAt: {
        required: 'validation.events.event.publishAt.required'
      }
    }
  },
  contact: {
    inquiry: {
      name: {
        required: 'validation.contact.inquiry.name.required'
      },
      email: {
        required: 'validation.contact.inquiry.email.required',
        invalid: 'validation.contact.inquiry.email.invalid'
      },
      subject: {
        required: 'validation.contact.inquiry.subject.required'
      },
      message: {
        required: 'validation.contact.inquiry.message.required'
      },
      status: {
        required: 'validation.contact.inquiry.status.required'
      }
    }
  },
  seo: {
    siteName: {
      required: 'validation.seo.siteName.required'
    },
    defaultTitle: {
      required: 'validation.seo.defaultTitle.required'
    },
    defaultDescription: {
      required: 'validation.seo.defaultDescription.required'
    },
    defaultCanonicalBase: {
      invalid: 'validation.seo.defaultCanonicalBase.invalid'
    },
    defaultOgImageUrl: {
      invalid: 'validation.seo.defaultOgImageUrl.invalid'
    },
    defaultTwitterImageUrl: {
      invalid: 'validation.seo.defaultTwitterImageUrl.invalid'
    },
    structuredDataJson: {
      invalid: 'validation.seo.structuredDataJson.invalid'
    },
    hreflangLocales: {
      min: 'validation.seo.hreflangLocales.min'
    },
    defaultLocale: {
      required: 'validation.seo.defaultLocale.required',
      oneOf: 'validation.seo.defaultLocale.oneOf'
    },
    routeOverride: {
      routeKey: {
        required: 'validation.seo.routeOverride.routeKey.required'
      },
      canonicalUrl: {
        invalid: 'validation.seo.routeOverride.canonicalUrl.invalid'
      },
      ogImageUrl: {
        invalid: 'validation.seo.routeOverride.ogImageUrl.invalid'
      },
      twitterImageUrl: {
        invalid: 'validation.seo.routeOverride.twitterImageUrl.invalid'
      },
      structuredDataJson: {
        invalid: 'validation.seo.routeOverride.structuredDataJson.invalid'
      },
      hreflangUrl: {
        invalid: 'validation.seo.routeOverride.hreflangUrl.invalid'
      }
    }
  },
  booking: {
    service: {
      name: {
        required: 'validation.booking.service.name.required'
      },
      slug: {
        required: 'validation.booking.service.slug.required'
      }
    },
    availability: {
      serviceId: {
        required: 'validation.booking.availability.serviceId.required'
      },
      date: {
        required: 'validation.booking.availability.date.required'
      },
      dayOfWeek: {
        required: 'validation.booking.availability.dayOfWeek.required'
      },
      startMinutes: {
        required: 'validation.booking.availability.startMinutes.required'
      },
      endMinutes: {
        required: 'validation.booking.availability.endMinutes.required'
      }
    },
    booking: {
      serviceId: {
        required: 'validation.booking.booking.serviceId.required'
      },
      startAt: {
        required: 'validation.booking.booking.startAt.required'
      },
      endAt: {
        required: 'validation.booking.booking.endAt.required'
      },
      customerName: {
        required: 'validation.booking.booking.customerName.required'
      },
      customerEmail: {
        required: 'validation.booking.booking.customerEmail.required',
        invalid: 'validation.booking.booking.customerEmail.invalid'
      }
    }
  },
  payments: {
    checkout: {
      mode: {
        required: 'validation.payments.checkout.mode.required'
      },
      successUrl: {
        required: 'validation.payments.checkout.successUrl.required'
      },
      cancelUrl: {
        required: 'validation.payments.checkout.cancelUrl.required'
      },
      customerEmail: {
        invalid: 'validation.payments.checkout.customerEmail.invalid'
      },
      lineItemName: {
        required: 'validation.payments.checkout.lineItemName.required'
      },
      lineItemAmount: {
        required: 'validation.payments.checkout.lineItemAmount.required'
      },
      lineItemCurrency: {
        required: 'validation.payments.checkout.lineItemCurrency.required'
      }
    },
    intent: {
      amount: {
        required: 'validation.payments.intent.amount.required'
      },
      currency: {
        required: 'validation.payments.intent.currency.required'
      }
    },
    subscription: {
      customerId: {
        required: 'validation.payments.subscription.customerId.required'
      },
      priceId: {
        required: 'validation.payments.subscription.priceId.required'
      }
    }
  }
};




